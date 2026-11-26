import test from 'node:test';import assert from 'node:assert/strict';import {Client,type Room} from '@colyseus/sdk';import {matchMaker} from '@colyseus/core';import {makeServer,type BasketballRoom} from './server';import {QuickPlay} from './quickPlay';import {connectQuickPlay} from '../../web/game/onlineClient';
const wait=async(fn:()=>boolean)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('quick-play timeout');};const payload=(requestId=crypto.randomUUID())=>({requestId,nickname:'빠른선수',color:'blue'});
test('B: concurrent reservations group four then a fifth, deduplicate requests, whitelist modes and respect origins',async()=>{
 const server=makeServer({webOrigins:['https://web.example']});await server.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+(server.transport.server!.address() as {port:number}).port,client=new Client(base.replace('http:','ws:')),clients:Room[]=[];
 const post=(value:unknown,origin='https://web.example')=>fetch(base+'/quick-play',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(value)});
 try{assert.equal((await post(payload(),'https://evil.example')).status,403);const pre=await fetch(base+'/quick-play',{method:'OPTIONS',headers:{Origin:'https://web.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://web.example');assert.equal((await post({...payload(),mode:'practice'})).status,400);assert.equal((await post({...payload(),nickname:''})).status,400);
  for(const options of [{mode:'practice2v2'},{mode:'duel'},{mode:'teamDuel',isPrivate:true}])clients.push(await client.create('basketball',options));
  const same=payload();const duplicate=await Promise.all([post(same),post(same)]);const seats=await Promise.all(duplicate.map(r=>{assert.equal(r.status,200);return r.json();}));assert.equal(seats[0].sessionId,seats[1].sessionId);const rest=await Promise.all(Array.from({length:3},()=>post(payload()).then(async r=>{assert.equal(r.status,200);return r.json();})));assert.ok(rest.every(s=>s.roomId===seats[0].roomId));const fifth=await (await post(payload())).json();assert.notEqual(fifth.roomId,seats[0].roomId);assert.equal((await post({...same,color:'orange'})).status,409);
  const four=[seats[0],...rest];for(const seat of four)clients.push(await client.consumeSeatReservation(seat));const local=matchMaker.getLocalRoomById(seats[0].roomId) as BasketballRoom;assert.equal(local.world.actors.size,4);assert.deepEqual([...local.world.actors.values()].map(a=>a.teamId),['A','B','A','B']);assert.equal(local.world.match!.stage,'WAITING');clients.push(await client.consumeSeatReservation(fifth));
 }finally{await Promise.all(clients.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);}
});
test('B: reservation expiry frees capacity; cancelled late client joins then leaves without launching a session',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+(server.transport.server!.address() as {port:number}).port,client=new Client(base.replace('http:','ws:')),clients:Room[]=[];
 const post=(value:unknown)=>fetch(base+'/quick-play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 const previous=process.env.NEXT_PUBLIC_GAME_SERVER_URL;
 try{clients.push(await client.create('basketball',{mode:'teamDuel'}));for(let i=0;i<2;i++)clients.push(await client.joinById(clients[0].roomId));const room=matchMaker.getLocalRoomById(clients[0].roomId) as BasketballRoom;room.seatReservationTimeout=.12;const value=payload(),reserved=await (await post(value)).json();assert.equal(reserved.roomId,room.roomId);assert.ok(room.hasReachedMaxClients());for(const r of clients)r.send('matchIntent',{matchId:1,intent:'ready'});await wait(()=>Object.values(room.world.match!.ready).filter(Boolean).length===3);assert.equal(room.world.match!.stage,'WAITING');await wait(()=>!room.hasReachedMaxClients());assert.equal((await post(value)).status,409);
  process.env.NEXT_PUBLIC_GAME_SERVER_URL=base.replace('http:','ws:');await assert.rejects(connectQuickPlay('취소한선수','blue',()=>false),/QUICK_CANCELLED/);await wait(()=>room.world.actors.size===3);assert.equal(room.world.match!.stage,'WAITING');
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_GAME_SERVER_URL;else process.env.NEXT_PUBLIC_GAME_SERVER_URL=previous;await Promise.all(clients.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);}
});
test('B: bounded race retries release the allocator queue; backend failures never create a fallback room',async()=>{
 let live=true,reserves=0,creates=0;const room={directoryPrivate:false,locked:false,seatReservationTimeout:15,world:{mode:'teamDuel',match:{stage:'WAITING'},canJoin:()=>true},hasReachedMaxClients:()=>false};
 const api={query:async()=>[{roomId:'test'}],getLocalRoomById:()=>live?room:undefined,createRoom:async()=>{creates++;return {roomId:'new'};},reserveSeatFor:async()=>{reserves++;throw Error('backend unavailable');}};
 const q=new QuickPlay(api as any);await assert.rejects(q.request(payload()),/backend unavailable/);await assert.rejects(q.request(payload()),/backend unavailable/);assert.equal(creates,0);assert.equal(reserves,2);
 api.reserveSeatFor=async()=>{reserves++;live=false;throw Error('deleted');};api.query=async()=>{live=true;return [{roomId:'test'}];};await assert.rejects(q.request(payload()),/QUICK_RACE_LIMIT/);assert.equal(reserves,5);assert.equal(creates,0);
});


test('duel quick play reserves two seats, separates modes and rejects request mode changes',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+(server.transport.server!.address() as {port:number}).port,client=new Client(base.replace('http:','ws:')),clients:Room[]=[];
 const post=(value:unknown)=>fetch(base+'/quick-play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{
  clients.push(await client.create('basketball',{mode:'teamDuel'}));
  clients.push(await client.create('basketball',{mode:'duel',isPrivate:true}));
  const request={...payload(),mode:'duel'};
  const replies=await Promise.all([post(request),post({...payload(),mode:'duel'})]);
  for(const reply of replies)assert.equal(reply.status,200);
  const seats=await Promise.all(replies.map(reply=>reply.json()));
  assert.equal(seats[0].roomId,seats[1].roomId);
  assert.ok(clients.every(room=>room.roomId!==seats[0].roomId));
  assert.equal((await post({...request,mode:'teamDuel'})).status,409);
  const thirdResponse=await post({...payload(),mode:'duel'});assert.equal(thirdResponse.status,200);
  const third=await thirdResponse.json();assert.notEqual(third.roomId,seats[0].roomId);
  for(const seat of [...seats,third])clients.push(await client.consumeSeatReservation(seat));
  const room=matchMaker.getLocalRoomById(seats[0].roomId) as BasketballRoom;
  assert.equal(room.world.mode,'duel');assert.equal(room.world.actors.size,2);assert.equal(room.maxClients,2);assert.equal(room.world.match!.stage,'WAITING');
 }finally{await Promise.all(clients.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);}
});
