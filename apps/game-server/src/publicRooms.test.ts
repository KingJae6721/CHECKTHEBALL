import test from 'node:test';import assert from 'node:assert/strict';import {Client,type Room as ClientRoom} from '@colyseus/sdk';import {matchMaker,Room} from '@colyseus/core';
import {makeServer,BasketballRoom} from './server';
import {OnlineWorld} from '../../../packages/game-core/src/online';
const wait=async(fn:()=>boolean|Promise<boolean>)=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('directory timeout');};
test('public directory filters rooms, whitelists fields, enforces CORS and preserves private code joins and seat races',async()=>{
 const server=makeServer({webOrigins:['https://game.example']});server.define('other',class extends Room{onCreate(){this.maxClients=2;}});await server.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`,client=new Client(base.replace('http:','ws:')),rooms:ClientRoom[]=[];
 const create=async(options:object)=>{const r=await client.create('basketball',options);rooms.push(r);return r;};
 const list=async()=>{const res=await fetch(base+'/public-rooms');assert.equal(res.status,200);return (await res.json()).rooms as any[];};
 try{
  assert.deepEqual(await list(),[]);
  for(const options of [{roomName:'x'.repeat(31)},{roomName:'a\nb'},{roomName:5},{mode:'ranked'},{isPrivate:'false'},{roomName:'ok',extra:'x'.repeat(1400)}])await assert.rejects(client.create('basketball',options));
  const a=await create({nickname:'한글',mode:'duel',roomName:'  공개 코트  ',maxClients:99,metadata:{token:'secret',stage:'PLAYING'}});
  const hidden=await create({nickname:'비공개',isPrivate:true});const other=await client.create('other');rooms.push(other);
  const first=await list();assert.equal(first.length,1);assert.deepEqual(first[0],{roomId:a.roomId,roomName:'공개 코트',mode:'duel',players:1,maxPlayers:2,status:'WAITING'});
  const local=matchMaker.getLocalRoomById(a.roomId) as BasketballRoom;await wait(()=>local.metadata?.players===1);assert.equal(local.metadata.roomName,'공개 코트');
  const allowed=await fetch(base+'/public-rooms',{headers:{Origin:'https://game.example'}});assert.equal(allowed.headers.get('access-control-allow-origin'),'https://game.example');
  const denied=await fetch(base+'/public-rooms',{headers:{Origin:'https://evil.example'}});assert.equal(denied.status,403);assert.notEqual(denied.headers.get('access-control-allow-origin'),'https://evil.example');
  const privateJoin=await client.joinById(hidden.roomId);rooms.push(privateJoin);assert.equal((await list()).some(r=>r.roomId===hidden.roomId),false);
  const race=await Promise.allSettled([client.joinById(a.roomId),client.joinById(a.roomId)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);for(const result of race)if(result.status==='fulfilled')rooms.push(result.value);
  const guest=race.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<ClientRoom>;assert.equal(local.world.actors.size,2);assert.equal((await list()).some(r=>r.roomId===a.roomId),false);
  a.send('matchIntent',{matchId:1,intent:'ready'});await wait(()=>local.metadata?.readyCount===1);guest.value.send('matchIntent',{matchId:1,intent:'ready'});await wait(()=>local.world.match?.stage==='COUNTDOWN');await guest.value.leave();await wait(()=>local.world.match?.stage==='WAITING');await wait(async()=>!!(await list()).find(r=>r.roomId===a.roomId));
  const b=await client.joinById(a.roomId);rooms.push(b);a.send('matchIntent',{matchId:1,intent:'ready'});b.send('matchIntent',{matchId:1,intent:'ready'});await wait(()=>local.world.match?.stage==='PLAYING');await b.leave();await wait(()=>local.world.match?.stage==='ABORTED');assert.equal((await list()).some(r=>r.roomId===a.roomId),false);await assert.rejects(client.joinById(a.roomId));
  const stale=await create({roomName:'삭제될 방'}),staleId=stale.roomId;assert.ok((await list()).find(r=>r.roomId===staleId));await stale.leave();await wait(()=>!matchMaker.getLocalRoomById(staleId));await assert.rejects(client.joinById(staleId));assert.equal((await list()).some(r=>r.roomId===staleId),false);
  await a.leave();await wait(()=>!matchMaker.getLocalRoomById(a.roomId));
 }finally{await Promise.all(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);}
});
test('listing writes serialize/coalesce and disposal drains in-flight work without applying queued changes',async()=>{
 const room=new BasketballRoom();room.world=new OnlineWorld('duel');room.directoryName='순서 확인';const writes:any[]=[],resolve:(()=>void)[]=[];
 room.setMetadata=async metadata=>{writes.push(metadata);await new Promise<void>(done=>resolve.push(done));};
 const sync=()=>{(room as any).syncListing();};room.world.join('a');sync();room.world.join('b');sync();room.world.intent('a',{matchId:1,intent:'ready'});sync();assert.equal(writes.length,1);
 resolve[0]();await Promise.resolve();await Promise.resolve();assert.equal(writes.length,2);assert.equal(writes[1].players,2);assert.equal(writes[1].readyCount,1);
 room.world.intent('b',{matchId:1,intent:'ready'});sync();const disposed=room.onDispose();resolve[1]();await disposed;sync();assert.equal(writes.length,2);
});
