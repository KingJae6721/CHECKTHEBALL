import test from 'node:test';import assert from 'node:assert/strict';import {Client} from '@colyseus/sdk';
import {makeServer} from './server';
test('E: application ping/pong uses the joined game socket without consuming movement input',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const client=new Client(`ws://127.0.0.1:${(server.transport.server!.address() as {port:number}).port}`);
 const room=await client.create('basketball');try{
  const elapsed=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('pong timeout')),2000),start=performance.now();room.onMessage('diagnosticPong',(value:{id:number})=>{assert.equal(value.id,7);clearTimeout(timer);resolve(performance.now()-start);});room.send('diagnosticPing',{id:7});});
  assert.ok(elapsed>=0);await new Promise(r=>setTimeout(r,80));const frame=JSON.parse((room.state as {frame:string}).frame);
  assert.equal(frame.serverTiming.supportsPing,true);assert.equal(frame.players[0].processedMoveSeq,0);assert.ok(frame.serverTiming.scheduleDelayMs>=0);
 }finally{await room.leave();await server.gracefullyShutdown(false);}
});
