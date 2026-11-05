import test from 'node:test';import assert from 'node:assert/strict';import {Client,type Room} from '@colyseus/sdk';import {makeServer} from './server';
test('server rejects invalid display names and identifies duplicate names by session ID',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const client=new Client(`ws://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`),rooms:Room[]=[];
 try{
  for(const nickname of ['', 'a\nb','x'.repeat(21)])await assert.rejects(client.create('basketball',{nickname}));
  const a=await client.create('basketball',{nickname:'같은 이름'});rooms.push(a);const b=await client.joinById(a.roomId,{nickname:'같은 이름'});rooms.push(b);assert.notEqual(a.sessionId,b.sessionId);
 }finally{await Promise.all(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);}
});
