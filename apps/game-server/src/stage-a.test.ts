import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {matchMaker} from '@colyseus/core';
import {makeServer} from './server';
import type {WorldSnapshot} from '../../../packages/game-core/src/online';
test('A: two SDK clients share one room, third rejected; authoritative movement and disposal',async()=>{
 const server=makeServer();await server.listen(0,'127.0.0.1');const port=(server.transport.server!.address() as {port:number}).port;
 const client=new Client(`ws://127.0.0.1:${port}`);let a:Awaited<ReturnType<Client['create']>>|undefined,b:typeof a;
 try{a=await client.create('basketball');b=await client.joinById(a.roomId);await assert.rejects(client.joinById(a.roomId));
  const frame=()=>new Promise<WorldSnapshot>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('snapshot timeout')),3000);b!.onStateChange.once((s:any)=>{if(!s.frame)return;clearTimeout(timer);resolve(JSON.parse(s.frame));});});
  const first=await frame();assert.equal(first.players.length,2);
  a.send('input',{seq:1,x:0,z:1,sprint:false,yaw:0,pitch:0,actions:['jump']});await new Promise(r=>setTimeout(r,160));const next=await frame();const p=next.players.find(p=>p.id===a!.sessionId)!;assert.ok(p.position.z>first.players.find(p=>p.id===a!.sessionId)!.position.z);assert.ok(p.position.y>0);
 }finally{await a?.leave();await b?.leave();await new Promise(r=>setTimeout(r,80));if(a)assert.equal((await matchMaker.query({roomId:a.roomId})).length,0);await server.gracefullyShutdown(false);}
});
