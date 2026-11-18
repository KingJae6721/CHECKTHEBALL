import test from 'node:test';import assert from 'node:assert/strict';import {Client,type Room} from '@colyseus/sdk';import {matchMaker} from '@colyseus/core';import {makeServer,type BasketballRoom} from './server';
const wait=async(fn:()=>boolean)=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}assert.fail('color sync timeout');};
test('two clients see each actor chosen color; live updates cannot impersonate a peer or cancel a charge',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const client=new Client(`ws://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`),rooms:Room[]=[];
 const color=(r:Room,id:string)=>JSON.parse((r.state as {frame:string}).frame||'{}').players?.find((p:any)=>p.id===id)?.color;
 try{
  const a=await client.create('basketball',{nickname:'A',color:'orange'});rooms.push(a);const b=await client.joinById(a.roomId,{nickname:'B',color:'blue'});rooms.push(b);
  await wait(()=>color(a,a.sessionId)==='orange'&&color(a,b.sessionId)==='blue'&&color(b,a.sessionId)==='orange'&&color(b,b.sessionId)==='blue');
  a.send('input',{seq:1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['shotDown']});const w=(matchMaker.getLocalRoomById(a.roomId) as BasketballRoom).world;await wait(()=>w.actors.get(a.sessionId)?.phase==='CHARGING');
  a.send('playerColor','purple');a.send('playerColor',{actorId:b.sessionId,color:'orange'});a.send('playerColor','__proto__');await wait(()=>color(a,a.sessionId)==='purple'&&color(b,a.sessionId)==='purple');assert.equal(w.actors.get(a.sessionId)?.phase,'CHARGING');assert.equal(color(b,b.sessionId),'blue');
  a.send('playerColor','blue');await wait(()=>color(b,a.sessionId)==='blue');assert.equal(color(b,b.sessionId),'blue');
  await b.leave();const c=await client.joinById(a.roomId,{nickname:'C',color:'yellow'});rooms.push(c);await wait(()=>color(a,c.sessionId)==='yellow'&&color(c,a.sessionId)==='blue');
  await assert.rejects(client.create('basketball',{color:'invalid'}));
 }finally{await Promise.all(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);}
});
