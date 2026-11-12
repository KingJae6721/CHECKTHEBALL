import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineSession} from '../../../apps/web/game/onlineClient.ts';
import {OnlineWorld} from './online.ts';
import {zeroInput} from './simulation.ts';
import {NETWORK} from '../../protocol/src/index.ts';
function setup(){
 const world=new OnlineWorld();world.join('a');const sent:any[]=[];
 const event=Object.assign(()=>{},{remove:()=>{}});
 const room={sessionId:'a',roomId:'test',reconnection:{enabled:true},onDrop:event,onLeave:event,onError:event,onStateChange:event,send:(_name:string,value:any)=>{if(_name==='input'){sent.push(value);world.receive('a',value);}},onMessage:()=>()=>{},connection:{isOpen:false}};
 const session=new OnlineSession(room as any);session.receive({frame:JSON.stringify(world.snapshot())});return {world,session,sent};
}
test('pump gap and catch-up limit recover movement without sending gameplay cancel',()=>{
 for(const gap of [100,300]){
  const {world,session,sent}=setup(),input={...zeroInput(),x:1,yaw:1,pitch:.4};
  session.send(input,['shotDown']);world.step();session.receive({frame:JSON.stringify(world.snapshot())});
  const t=performance.now();session.advance(t,input);session.advance(t+gap,input);
  assert.ok(sent.at(-1).actions.includes('movementSync'));assert.ok(!sent.some(m=>m.actions.includes('cancel')));
  world.step();session.receive({frame:JSON.stringify(world.snapshot())});assert.equal(world.actors.get('a')!.phase,'CHARGING');
  session.advance(t+gap+17,input);session.advance(t+gap+34,input);assert.ok(session.prediction.pending.length>0);
  assert.equal(input.yaw,1);assert.equal(input.pitch,.4);
 }
});
test('pending limit records cause and resyncs without losing held pass',()=>{
 const {world,session,sent}=setup(),input=zeroInput();session.send(input,['passDown']);world.step();session.receive({frame:JSON.stringify(world.snapshot())});
 let t=performance.now();session.advance(t,input);for(let i=0;i<NETWORK.maxPendingInputs+5;i++){t+=17;session.advance(t,input);}
 assert.equal(session.cancelCounts.PENDING_LIMIT,1);assert.ok(sent.at(-1).actions.includes('movementSync'));
 world.step();session.receive({frame:JSON.stringify(world.snapshot())});assert.equal(world.actors.get('a')!.phase,'PASS_CHARGING');
 assert.ok(session.trace.some(e=>e.reason==='PENDING_LIMIT'));
});
test('authority replay retires ACKed movement and preserves only unapplied commands',()=>{
 const {world,session}=setup(),input={...zeroInput(),x:1},t=performance.now();session.advance(t,input);
 session.advance(t+34,input);assert.equal(session.prediction.pending.length,2);
 world.step();session.receive({frame:JSON.stringify(world.snapshot())});assert.equal(session.prediction.pending.length,1);
 const predicted={...session.prediction.position};world.step();session.receive({frame:JSON.stringify(world.snapshot())});
 assert.equal(session.prediction.pending.length,0);assert.ok(Math.abs(predicted.x-session.prediction.position.x)<1e-9);
 assert.equal(session.prediction.corrections,0);
});
test('explicit cancel remains a gameplay cancel, with reason and timestamp',()=>{
 const {world,session}=setup();session.send(zeroInput(),['shotDown']);world.step();
 session.send(zeroInput(),['cancel'],'BLUR');world.step();assert.equal(world.actors.get('a')!.phase,'HELD');
 assert.equal(session.cancelCounts.BLUR,1);const record=session.trace.find(e=>e.reason==='BLUR');assert.equal(typeof record?.at,'number');
});
