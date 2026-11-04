import {Server,Room,type Client} from '@colyseus/core';
import {Schema,defineTypes} from '@colyseus/schema';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {OnlineWorld} from '../../../packages/game-core/src/online';
import {NETWORK} from '../../../packages/protocol/src/index';
export class CourtEnvelope extends Schema{declare tick:number;declare frame:string;constructor(){super();this.tick=0;this.frame='';}}
defineTypes(CourtEnvelope,{tick:'uint32',frame:'string'});
export class BasketballRoom extends Room<{state:CourtEnvelope}>{
 maxClients=2;world=new OnlineWorld();timing={tickMs:0,maxTickMs:0,callbackGapMs:0,discardedTimeMs:0};
 onCreate(){this.setState(new CourtEnvelope());this.setPatchRate(1000/NETWORK.snapshotRate);let accumulator=0,lastPublished=0;
  this.setSimulationInterval(ms=>{this.timing.callbackGapMs=ms;this.timing.discardedTimeMs+=Math.max(0,ms-150);accumulator+=Math.min(ms,150);let steps=0;while(accumulator>=1000/NETWORK.tickRate&&steps++<8){const started=performance.now();this.world.step();this.timing.tickMs=performance.now()-started;this.timing.maxTickMs=Math.max(this.timing.maxTickMs,this.timing.tickMs);accumulator-=1000/NETWORK.tickRate;}if(this.world.tick-lastPublished>=3){this.publish();lastPublished=this.world.tick;}},1000/NETWORK.tickRate);
  this.onMessage('input',(client,value)=>this.world.receive(client.sessionId,value));
 }
 publish(){this.state.tick=this.world.tick;this.state.frame=JSON.stringify({...this.world.snapshot(),serverTiming:this.timing});}
 onJoin(client:Client,options?:{nickname?:unknown}){this.world.join(client.sessionId,typeof options?.nickname==='string'?options.nickname:undefined);this.publish();}
 onLeave(client:Client){this.world.leave(client.sessionId);this.publish();}
}
export function makeServer(){const server=new Server({transport:new WebSocketTransport({maxPayload:4096}),greet:false});server.define('basketball',BasketballRoom);return server;}
