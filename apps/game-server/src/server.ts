import {Server,Room,type Client} from '@colyseus/core';
import {Schema,defineTypes} from '@colyseus/schema';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {OnlineWorld} from '../../../packages/game-core/src/online';
import {NETWORK} from '../../../packages/protocol/src/index';
import {Samples} from '../../../packages/protocol/src/diagnostics';
import {validateNickname} from '../../../packages/protocol/src/nickname';
import {RoomChat} from './roomChat';
import {roomCreation,ROOM_CAPACITY} from '../../../packages/protocol/src/rooms';
import {directoryRouter} from './publicRooms';
export class CourtEnvelope extends Schema{declare tick:number;declare frame:string;constructor(){super();this.tick=0;this.frame='';}}
defineTypes(CourtEnvelope,{tick:'uint32',frame:'string'});
export class BasketballRoom extends Room<{state:CourtEnvelope}>{
 private chat!:RoomChat;
 directoryName='';directoryPrivate=false;
 private listingKey='';private listingPending:Record<string,unknown>|undefined;private listingWrite:Promise<void>|undefined;private listingDisposed=false;
 private syncListing(){
  if(this.listingDisposed)return;
  const metadata={roomName:this.directoryName,mode:this.world.mode,stage:this.world.match?.stage??'WAITING',players:this.world.actors.size,readyCount:Object.values(this.world.match?.ready??{}).filter(Boolean).length};
  const key=JSON.stringify(metadata);if(key===this.listingKey)return;this.listingKey=key;this.listingPending=metadata;
  if(!this.listingWrite)this.listingWrite=this.flushListing();
 }
 private async flushListing(){
  try{while(this.listingPending&&!this.listingDisposed){const next=this.listingPending;this.listingPending=undefined;await this.setMetadata(next);}}
  catch{this.listingKey='';}
  finally{this.listingWrite=undefined;}
 }

 maxClients=2;world=new OnlineWorld();timing={tickMs:0,maxTickMs:0,callbackGapMs:0,discardedTimeMs:0,supportsPing:true,tickP50Ms:null as number|null,tickP95Ms:null as number|null,scheduleDelayMs:0,scheduleP95Ms:null as number|null,debtMs:0};
 private tickSamples=new Samples(600);private scheduleSamples=new Samples(200);private sampledAt=0;private pingAt=new Map<string,number>();
 async onCreate(options?:unknown){const parsed=roomCreation(options);if(parsed.error)throw Error('INVALID_ROOM_OPTIONS');const settings=parsed.options;this.directoryName=settings.roomName;this.directoryPrivate=settings.isPrivate;this.maxClients=ROOM_CAPACITY[settings.mode];this.world=new OnlineWorld(settings.mode);await this.setMatchmaking({private:settings.isPrivate,metadata:{roomName:settings.roomName,mode:settings.mode,stage:'WAITING',players:0,readyCount:0}});this.setState(new CourtEnvelope());this.setPatchRate(1000/NETWORK.snapshotRate);let accumulator=0,lastPublished=0,lastCallback=performance.now();
  this.setSimulationInterval(ms=>{const now=performance.now(),step=1000/NETWORK.tickRate;this.timing.callbackGapMs=now-lastCallback;lastCallback=now;this.timing.scheduleDelayMs=Math.max(0,this.timing.callbackGapMs-step);this.scheduleSamples.add(this.timing.scheduleDelayMs);this.timing.discardedTimeMs+=Math.max(0,ms-150);accumulator+=Math.min(ms,150);let steps=0;while(accumulator>=step&&steps++<8){const started=performance.now();this.world.step();this.timing.tickMs=performance.now()-started;this.tickSamples.add(this.timing.tickMs);this.timing.maxTickMs=Math.max(this.timing.maxTickMs,this.timing.tickMs);accumulator-=step;}this.timing.debtMs=accumulator;if(now-this.sampledAt>=1000){const tick=this.tickSamples.summary();this.timing.tickP50Ms=tick.p50;this.timing.tickP95Ms=tick.p95;this.timing.scheduleP95Ms=this.scheduleSamples.summary().p95;this.sampledAt=now;}if(this.world.tick-lastPublished>=3){this.publish();lastPublished=this.world.tick;}},1000/NETWORK.tickRate);
  this.onMessage('input',(client,value)=>this.world.receive(client.sessionId,value));
  this.chat=new RoomChat(this.roomId);
  this.onMessage('chatSend',(client,value)=>{const actor=this.world.actors.get(client.sessionId);if(!actor)return;const result=this.chat.receive(client.sessionId,actor.nickname??"Guest",value);if('error'in result)client.send('chatError',result.error);else if(result.duplicate)client.send('chatMessage',result.message);else this.broadcast('chatMessage',result.message);});
  this.onMessage('chatHistoryRequest',client=>{const history=this.chat.recent(client.sessionId);if(history)client.send('chatHistory',history);});
  this.onMessage('matchIntent',(client,value)=>{if(this.world.intent(client.sessionId,value))this.publish();});
  this.onMessage('diagnosticPing',(client,value)=>{const now=performance.now();if(!value||!Number.isSafeInteger(value.id)||value.id<0||now-(this.pingAt.get(client.sessionId)??-Infinity)<500)return;this.pingAt.set(client.sessionId,now);client.send('diagnosticPong',{id:value.id});});
 }
 publish(){this.syncListing();this.state.tick=this.world.tick;this.state.frame=JSON.stringify({...this.world.snapshot(),serverTiming:this.timing});}
 onAuth(_client:Client,options?:{nickname?:unknown}){if(!this.world.canJoin())throw Error('MATCH_NOT_JOINABLE');if(options?.nickname!==undefined&&validateNickname(options.nickname).error)throw Error('INVALID_NICKNAME');return true;}
 onJoin(client:Client,options?:{nickname?:unknown}){this.world.join(client.sessionId,typeof options?.nickname==='string'?options.nickname:undefined);this.chat.join(client.sessionId);this.publish();}
 onLeave(client:Client){this.chat.leave(client.sessionId);this.pingAt.delete(client.sessionId);this.world.leave(client.sessionId);this.publish();}
 async onDispose(){this.listingDisposed=true;this.listingPending=undefined;await this.listingWrite;this.chat?.dispose();}
}
export function makeServer(options:{webOrigins?:readonly string[]}={}){const origins=options.webOrigins??(process.env.GAME_WEB_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean);const server=new Server({transport:new WebSocketTransport({maxPayload:4096}),greet:false});server.router=directoryRouter(origins);server.define('basketball',BasketballRoom);return server;}
