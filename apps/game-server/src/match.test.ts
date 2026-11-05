import test from 'node:test';import assert from 'node:assert/strict';
import {Client,type Room} from '@colyseus/sdk';import {matchMaker} from '@colyseus/core';
import {makeServer,type BasketballRoom} from './server';import type {WorldSnapshot} from '../../../packages/game-core/src/online';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn:()=>boolean)=>{for(let n=0;n<300;n++){if(fn())return;await sleep(10);}throw Error('match socket state timeout');};
test('duel socket ready/countdown, seat reuse, abort admission and room disposal',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const client=new Client(`ws://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`),rooms:Room[]=[];
 try{
  const a=await client.create('basketball',{mode:'duel',nickname:'Alpha'}),b=await client.joinById(a.roomId,{nickname:'Beta',mode:'practice'});rooms.push(a,b);
  const local=matchMaker.getLocalRoomById(a.roomId) as BasketballRoom,w=local.world;
  const frame=(r:Room):WorldSnapshot=>JSON.parse((r.state as {frame:string}).frame);
  await wait(()=>!!(a.state as {frame?:string}).frame&&frame(a).players.length===2);assert.equal(frame(a).mode,'duel');
  a.send('matchIntent',{matchId:1,intent:'ready'});b.send('matchIntent',{matchId:1,intent:'ready'});
  await wait(()=>frame(a).match?.stage==='COUNTDOWN');await b.leave();await wait(()=>frame(a).match?.stage==='WAITING');
  const c=await client.joinById(a.roomId,{nickname:'Gamma'});rooms.push(c);await wait(()=>frame(a).players.some(p=>p.id===c.sessionId));
  a.send('matchIntent',{matchId:1,intent:'ready'});c.send('matchIntent',{matchId:1,intent:'ready'});
  await wait(()=>frame(a).match?.stage==='COUNTDOWN');await wait(()=>frame(a).match?.stage==='PLAYING');
  await c.leave();await wait(()=>frame(a).match?.stage==='ABORTED');assert.equal(w.match?.result?.players.length,2);
  await assert.rejects(client.joinById(a.roomId,{nickname:'Replacement'}));
  const id=a.roomId;await a.leave();await wait(()=>!matchMaker.getLocalRoomById(id));
 }finally{await Promise.all(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);}
});
