import test from 'node:test';import assert from 'node:assert/strict';
import {Client,type Room} from '@colyseus/sdk';import {matchMaker} from '@colyseus/core';
import {makeServer,type BasketballRoom} from './server';import {OnlineWorld} from '../../../packages/game-core/src/online';import {COURT} from '../../../packages/game-core/src/court';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('C: real SDK steal invalidates queued release, single pickup, block and shooter score',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const client=new Client(`ws://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`);const clients:Room[]=[];
 try{const a=await client.create('basketball'),b=await client.joinById(a.roomId);clients.push(a,b);const room=matchMaker.getLocalRoomById(a.roomId) as BasketballRoom;
  const setup=()=>{const w=new OnlineWorld();w.tick=room.world.tick;w.time=room.world.time;w.join(a.sessionId);w.join(b.sessionId);room.world=w;return w;};
  const wait=async(predicate:()=>boolean)=>{for(let n=0;n<300;n++){if(predicate())return;await sleep(10);}throw Error('server condition timeout');};
  let w=setup(),p=w.actors.get(a.sessionId)!,q=w.actors.get(b.sessionId)!;p.position={x:0,y:0,z:0};q.position={x:-.4,y:0,z:-1.1};p.input.yaw=Math.PI;await sleep(30);
  a.send('input',{seq:1,x:0,z:0,sprint:false,yaw:Math.PI,pitch:0,actions:['passDown','passUp']});b.send('input',{seq:1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['steal']});await wait(()=>w.ownerId===b.sessionId);assert.equal(p.motion.pending,null);
  a.send('input',{seq:2,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['passUp']});await sleep(150);assert.equal(w.ownerId,b.sessionId);assert.equal(w.state.flightKind,null);
  w=setup();w.ownerId=null;w.actors.get(a.sessionId)!.position={x:-.3,y:0,z:0};w.actors.get(b.sessionId)!.position={x:.3,y:0,z:0};w.state.ball={x:0,y:.2,z:.1};await wait(()=>w.ownerId!==null);assert.ok([a.sessionId,b.sessionId].includes(w.ownerId!));
  w=setup();w.ownerId=null;w.state.ball={x:0,y:5,z:4};w.state.flightKind='shot';w.state.resolved=false;w.shooterId=b.sessionId;w.passerId=b.sessionId;
  a.send('input',{seq:1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['block']});await wait(()=>w.actors.get(a.sessionId)!.defense.elapsed>=.1);p=w.actors.get(a.sessionId)!;const hand=p.defense.hand;w.state.ball={...hand,z:hand.z+.6};w.state.ballVelocity={x:0,y:0,z:-80};await wait(()=>p.defense.hit);assert.equal(w.ownerId,null);assert.ok(w.state.ballVelocity.z>0);assert.equal(w.state.events.recent.filter(e=>e.kind==='blockHit').length,1);
  w.state.ball={...COURT.rim,y:COURT.rim.y+.03};w.state.ballVelocity={x:0,y:-4,z:0};await wait(()=>w.state.made===1);assert.equal(w.actors.get(b.sessionId)!.score,1);assert.equal(w.shooterId,b.sessionId);await sleep(200);assert.equal(w.state.made,1);assert.equal(w.state.events.recent.filter(e=>e.kind==='net').length,1);
 }finally{await Promise.all(clients.filter(c=>c.connection?.isOpen).map(c=>c.leave()));await sleep(50);await server.gracefullyShutdown(false);}
});
