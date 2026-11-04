import test from 'node:test';import assert from 'node:assert/strict';
import {OnlineWorld,movePair} from './online.ts';import {BODY} from './court.ts';
import {COURT} from './court.ts';
import {defenseHand} from './defense.ts';
const send=(w:OnlineWorld,id:string,actions:string[]=[],extra={})=>{const a=w.actors.get(id)!;return w.receive(id,{seq:a.ack+1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions,...extra});};
function world(){const w=new OnlineWorld();w.join('a');w.join('b');return w;}
test('online rejects authority fields, bad numbers, duplicate seq, overflow; input timeout cancels charge',()=>{
 const w=world();assert.equal(send(w,'a',[],{ball:{x:4}}),false);assert.equal(send(w,'a',[],{x:NaN}),false);assert.ok(send(w,'a',['shotDown']));w.step();assert.equal(w.receive('a',{seq:0,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:[]}),false);for(let n=0;n<50;n++)w.step();assert.equal(w.actors.get('a')!.phase,'HELD');assert.equal(w.state.attempts,0);
});
test('online shared controlled ball, crossover, same-tick click releases exactly once',()=>{
 const w=world();send(w,'a',['crossover']);for(let n=0;n<35;n++)w.step();assert.equal(w.ownerId,'a');assert.equal(w.actors.get('a')!.motion.currentDribbleHand,'left');send(w,'a',['shotDown','shotUp']);for(let n=0;n<25;n++)w.step();assert.equal(w.state.attempts,1);assert.equal(w.ownerId,null);assert.equal(w.shooterId,'a');send(w,'a',['shotUp']);w.step();assert.equal(w.state.attempts,1);
});
test('online manual pass is caught by the other actor without shot statistics',()=>{
 const w=world();send(w,'b',[],{yaw:-Math.PI/2});send(w,'a',['passDown','passUp'],{yaw:Math.PI/2,pitch:.1});for(let n=0;n<55&&w.ownerId!=='b';n++)w.step();assert.equal(w.ownerId,'b');assert.equal(w.state.attempts,0);assert.equal(w.state.score,0);assert.equal(w.state.ballVelocity.x,0);
});
test('online relative body sweep is symmetric, resists large crossing, preserves separation in air',()=>{
 const start=[{x:-1,z:0},{x:1,z:0}],delta=[{x:8,z:.5},{x:-8,z:.5}];const p=movePair(start,delta),q=movePair([...start].reverse(),[...delta].reverse()).reverse();assert.deepEqual(p,q);assert.ok(p[0].x<p[1].x);assert.ok(Math.hypot(p[0].x-p[1].x,p[0].z-p[1].z)>=BODY.radius*2-BODY.tolerance);
 const w=world();for(let n=0;n<70;n++){send(w,'a',n===0?['jump']:[],{x:1});send(w,'b',n===0?['jump']:[],{x:-1});w.step();assert.ok(Math.hypot(w.actors.get('a')!.position.x-w.actors.get('b')!.position.x,w.actors.get('a')!.position.z-w.actors.get('b')!.position.z)>=BODY.radius*2-BODY.tolerance);}
});
test('online leave frees a held ball; replacement gets empty slot without resetting flight or scores',()=>{
 const w=world();w.step();w.state.score=3;w.leave('a');assert.equal(w.ownerId,null);assert.equal(w.state.flightKind,null);w.join('c');assert.equal(w.ownerId,null);assert.equal(w.state.score,3);assert.equal(w.actors.get('c')!.slot,0);w.state.flightKind='shot';w.leave('b');assert.equal(w.state.flightKind,'shot');
});
test('online simultaneous loose pickup rotates priority instead of always rewarding first join',()=>{
 const winners=new Set<string|null>();for(const tick of [0,1]){const w=world();w.ownerId=null;w.tick=tick;w.actors.get('a')!.position={x:-.3,y:0,z:0};w.actors.get('b')!.position={x:.3,y:0,z:0};w.state.ball={x:0,y:.2,z:.1};w.state.flightKind=null;w.state.releaseAge=2;w.step();winners.add(w.ownerId);assert.ok(w.ownerId);assert.equal(w.snapshot().players.filter(a=>a.id===w.ownerId).length,1);}assert.equal(winners.size,2);
});
test('online steal cancels queued opposing release and stale mouseup cannot emit a pass',()=>{
 const w=world(),a=w.actors.get('a')!,b=w.actors.get('b')!;a.position={x:0,y:0,z:0};b.position={x:-.4,y:0,z:-1.1};a.input.yaw=Math.PI;w.step();send(w,'a',['passDown','passUp'],{yaw:Math.PI});send(w,'b',['steal']);for(let n=0;n<20&&w.ownerId!=='b';n++)w.step();assert.equal(w.ownerId,'b');assert.equal(a.motion.pending,null);send(w,'a',['passUp']);for(let n=0;n<30;n++)w.step();assert.equal(w.ownerId,'b');assert.equal(w.state.flightKind,null);assert.equal(w.state.attempts,0);
});
test('online block changes shared velocity once and score retains releasing shooter',()=>{
 const w=world(),a=w.actors.get('a')!;w.ownerId=null;Object.assign(a.defense,{kind:'BLOCK',elapsed:.1,previousElapsed:.08,airUsed:true});const h=defenseHand(a.position,0,'BLOCK',.1);a.defense.hand={...h};a.defense.previousHand={...h};w.state.ball={...h,z:h.z+.6};w.state.ballVelocity={x:0,y:0,z:-80};w.state.flightKind='shot';w.state.resolved=false;w.shooterId='b';w.passerId='b';w.step();assert.equal(a.defense.result,'BLOCK SUCCESS');assert.equal(w.ownerId,null);assert.ok(w.state.ballVelocity.z>0);
 w.state.ball={...COURT.rim,y:COURT.rim.y+.03};w.state.ballVelocity={x:0,y:-4,z:0};w.step();assert.equal(w.state.made,1);assert.equal(w.actors.get('b')!.score,1);for(let n=0;n<60;n++)w.step();assert.equal(w.state.made,1);
});
test('online actions preserve release-time aim and input floods cannot advance time',()=>{
 const w=world();send(w,'a',['passDown']);w.step();for(let n=0;n<10;n++)w.step();send(w,'a',['passUp'],{yaw:.25,pitch:-.2});send(w,'a',[],{yaw:1.3,pitch:.4});w.step();assert.equal(w.actors.get('a')!.motion.pending!.input.yaw,.25);assert.equal(w.actors.get('a')!.motion.pending!.input.pitch,-.2);const tick=w.tick;for(let n=0;n<110;n++)send(w,'b',['jump','jump','jump','jump','jump','jump','jump','jump']);assert.equal(w.tick,tick);assert.ok(w.actors.get('b')!.queue.length<=32);
});

// Movement recovery must never stand in for an explicit gameplay cancel.
test('movement sync acknowledges discarded frames without cancelling held shot/pass',()=>{
 for(const down of ['shotDown','passDown']){
  const w=world(),a=w.actors.get('a')!;
  send(w,'a',[down]);w.step();const phase=a.phase;
  send(w,'a',[],{moveSeq:1,x:1});send(w,'a',['movementSync']);w.step();
  assert.equal(a.phase,phase);assert.equal(a.buttons.size,1);assert.equal(a.processedMoveSeq,1);assert.equal(a.net.discarded,1);
  send(w,'a',[down==='shotDown'?'shotUp':'passUp']);for(let i=0;i<30;i++){send(w,'a');w.step();}
  assert.equal(w.state.attempts,down==='shotDown'?1:0);
 }
});
test('bounded queue retires oldest inputs and accepts fresh movement with monotonic ACK',()=>{
 const w=world(),a=w.actors.get('a')!;
 for(let i=1;i<=20;i++)assert.ok(send(w,'a',[],{moveSeq:i,x:1}));
 assert.equal(a.moves.length,12);assert.equal(a.processedMoveSeq,8);assert.equal(a.net.discarded,8);
 w.step();assert.equal(a.processedMoveSeq,9);assert.equal(a.net.consumed,1);
});
test('stale movement is retired without replay or charge cancellation',()=>{
 const w=world(),a=w.actors.get('a')!;send(w,'a',['shotDown']);w.step();
 send(w,'a',[],{moveSeq:1,x:1});a.moves[0].at=w.time-250;const x=a.position.x;w.step();
 assert.equal(a.processedMoveSeq,1);assert.equal(a.net.consumed,0);assert.equal(a.position.x,x);assert.equal(a.phase,'CHARGING');
});
test('an executed frame moves once, empty queue does not hold input forever',()=>{
 const w=world(),a=w.actors.get('a')!;send(w,'a',[],{moveSeq:1,x:1});w.step();const x=a.position.x;
 for(let i=0;i<10;i++)w.step();assert.equal(a.position.x,x);assert.equal(a.net.consumed,1);
});
test('input silence cancels once rather than every server tick',()=>{
 const w=world(),a=w.actors.get('a')!;send(w,'a',['shotDown']);for(let i=0;i<100;i++)w.step();
 assert.equal(a.net.timeouts,1);assert.equal(a.net.lastCancel,'INPUT_TIMEOUT');assert.equal(a.phase,'HELD');
});
