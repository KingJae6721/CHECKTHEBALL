import test from 'node:test';import assert from 'node:assert/strict';
import {Client,type Room} from '@colyseus/sdk';import {matchMaker} from '@colyseus/core';
import {makeServer,type BasketballRoom} from './server';
import type {WorldSnapshot} from '../../../packages/game-core/src/online';
import {COURT} from '../../../packages/game-core/src/court';
import {scoreboardSides} from '../../web/game/scoreboard';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('D: two clients agree on ID scores/nicknames/events and preserve leave/rejoin policy',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const client=new Client(`ws://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`),clients:Room[]=[];
 const wait=async(fn:()=>boolean)=>{for(let n=0;n<200;n++){if(fn())return;await sleep(10);}throw Error('score event timeout');};
 try{
  const a=await client.create('basketball',{nickname:'Alpha'}),b=await client.joinById(a.roomId,{nickname:'Beta'});clients.push(a,b);
  const room=matchMaker.getLocalRoomById(a.roomId) as BasketballRoom,w=room.world;
  const frame=(c:Room):WorldSnapshot=>JSON.parse((c.state as {frame:string}).frame);
  w.changeOwner(null);w.shooterId=b.sessionId;w.state.shotId=1;w.state.shotPoints=2;w.state.flightKind='shot';w.state.resolved=false;w.state.ball={...COURT.rim,y:COURT.rim.y+.02};w.state.ballVelocity={x:0,y:-4,z:0};
  await wait(()=>frame(a).players.some(p=>p.id===b.sessionId&&p.score===2)&&frame(b).players.some(p=>p.id===b.sessionId&&p.score===2));
  const fa=frame(a),fb=frame(b);assert.equal(scoreboardSides(fa.players,a.sessionId).opponent?.score,2);assert.equal(scoreboardSides(fb.players,b.sessionId).self?.score,2);
  assert.equal(fa.players.find(p=>p.id===a.sessionId)?.nickname,'Alpha');assert.equal(fb.players.find(p=>p.id===b.sessionId)?.nickname,'Beta');
  assert.equal(fa.events?.filter(e=>e.kind==='net').length,1);assert.equal(fb.events?.find(e=>e.kind==='net')?.actorId,b.sessionId);
  await b.leave();await wait(()=>frame(a).players.length===1);assert.equal(w.ledger.get(b.sessionId)?.score,2);
  const c=await client.joinById(a.roomId,{nickname:'Gamma'});clients.push(c);await wait(()=>frame(a).players.some(p=>p.id===c.sessionId));
  assert.equal(frame(a).players.find(p=>p.id===c.sessionId)?.score,0);assert.equal(frame(a).players.find(p=>p.id===a.sessionId)?.score,0);
 }finally{await Promise.all(clients.filter(c=>c.connection?.isOpen).map(c=>c.leave()));await sleep(50);await server.gracefullyShutdown(false);}
});
