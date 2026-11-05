import test from 'node:test';import assert from 'node:assert/strict';
import {Samples} from '../../protocol/src/diagnostics.ts';
import {MovementPrediction} from '../../../apps/web/game/movementPrediction.ts';
import {OnlineWorld} from './online.ts';import {zeroInput} from './simulation.ts';
import {OnlineSession} from '../../../apps/web/game/onlineClient.ts';
test('bounded percentiles ignore invalid samples and retain the latest window',()=>{
 const samples=new Samples(4);for(const n of [10,20,30,40,50,NaN,-1])samples.add(n);
 assert.deepEqual(samples.summary(),{count:4,p50:30,p95:40,max:50});samples.clear();assert.equal(samples.summary().p95,null);
});
test('local presentation interpolates a fixed step without changing movement, look, or ACK replay',()=>{
 const w=new OnlineWorld();w.join('a');const authority=w.snapshot().players[0],p=new MovementPrediction();p.accept(authority,undefined,true);
 const before={...p.position},input={...zeroInput(),x:1,yaw:.4,pitch:.2};p.push({seq:1,moveSeq:1,input,jump:false,phase:'HELD',phaseSeq:-1,sentAt:100});
 const end={...p.position},offset={...p.presentationOffset(100)},half={...p.presentationOffset(100+1000/120)};
 assert.ok(Math.abs(end.x+offset.x-before.x)<1e-9);assert.ok(Math.abs(end.x+half.x-(before.x+end.x)/2)<1e-9);
 assert.deepEqual(p.presentationOffset(120),p.offset);assert.deepEqual(p.position,end);assert.equal(p.pending.length,1);assert.equal(input.yaw,.4);assert.equal(input.pitch,.2);
 p.accept({...authority,position:{x:5,y:0,z:3},processedMoveSeq:1},undefined,true);assert.deepEqual(p.presentationOffset(121),{x:0,y:0,z:0});
});
test('144Hz presentation moves between 60Hz steps while logical command results stay identical',()=>{
 const w=new OnlineWorld();w.join('a');const p=new MovementPrediction();p.accept(w.snapshot().players[0],undefined,true);
 let nextStep=1000/60,seq=0,previousLogical=p.position.x,previousVisual=p.position.x,logicalStops=0,visualStops=0;
 for(let frame=1;frame<=288;frame++){const now=frame*1000/144;
  while(nextStep<=now+1e-8){p.push({seq:++seq,moveSeq:seq,input:{...zeroInput(),x:1},jump:false,phase:'HELD',phaseSeq:-1,sentAt:nextStep});nextStep+=1000/60;}
  const visual=p.position.x+p.presentationOffset(now).x;
  if(frame>10){if(Math.abs(p.position.x-previousLogical)<1e-8)logicalStops++;if(Math.abs(visual-previousVisual)<1e-8)visualStops++;}
  previousLogical=p.position.x;previousVisual=visual;
 }assert.ok(logicalStops>100);assert.equal(visualStops,0);assert.equal(p.pending.length,120);
});
test('snapshot underflow counts episodes and revision changes never tween ball discontinuities',()=>{
 const event=Object.assign(()=>{},{remove(){}}),room={sessionId:'a',reconnection:{enabled:true},onDrop:event,onLeave:event,onError:event,onStateChange:event,connection:{isOpen:false}};
 const session=new OnlineSession(room as any),w=new OnlineWorld();w.join('a');w.join('b');
 const a=w.snapshot();a.tick=1;a.time=100;a.ball={x:0,y:1,z:0};const b=structuredClone(a);b.tick=2;b.time=150;b.ball.x=2;
 session.frames=[a,b];(session as any).clockOffset=0;
 assert.equal(session.sample(225)?.ball.x,1);
 b.revision++;b.ownerId=null;assert.equal(session.sample(226)?.ball.x,0);
 session.sample(400);session.sample(410);assert.equal(session.underflowCount,1);session.close();
});
