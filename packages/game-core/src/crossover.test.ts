import test from 'node:test';
import assert from 'node:assert/strict';
import {CROSSOVER,COURT,DRIBBLE,PASS} from './court.ts';
import {requestCrossover,crossoverPoint,dribblePoint,controlledPosition,characterPose} from './motion.ts';
import {createState,stepGame,zeroInput,startCharge,startPassCharge,releaseShot,releasePass,cancelAllCharges,resetState,dummyCatchPosition,type State} from './simulation.ts';
import {passDirection,passSpeed} from './pass.ts';
const near=(a:number,b:number,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const floor=COURT.floorY+COURT.ballRadius;
function state(phase=.3,hand:'right'|'left'='right'){const s=createState();s.playerMotion.phase=phase;s.playerMotion.currentDribbleHand=hand;s.ball=dribblePoint(s.player,0,phase,s.playerMotion.height,hand);return s;}
function active(s:State){for(let n=0;n<120&&s.playerMotion.crossover?.stage!=='ACTIVE';n++)stepGame(s,zeroInput());assert.equal(s.playerMotion.crossover?.stage,'ACTIVE');}
function finish(s:State,input=zeroInput()){for(let n=0;n<200&&s.playerMotion.crossover;n++)stepGame(s,input);assert.equal(s.playerMotion.crossover,null);}
function emit(s:State,input=zeroInput()){for(let n=0;n<100&&s.playerMotion.pending;n++)stepGame(s,input);assert.equal(s.playerMotion.pending,null);}

test('right-to-left and left-to-right complete and keep the receiving hand',()=>{
 const s=state();assert.equal(s.playerMotion.currentDribbleHand,'right');assert.ok(requestCrossover(s));finish(s);assert.equal(s.playerMotion.currentDribbleHand,'left');for(let n=0;n<30;n++)stepGame(s,zeroInput());assert.ok(s.ball.x<s.player.x);
 assert.ok(requestCrossover(s));finish(s);assert.equal(s.playerMotion.currentDribbleHand,'right');for(let n=0;n<30;n++)stepGame(s,zeroInput());assert.ok(s.ball.x>s.player.x);
});
test('V path is symmetric, reaches the exact front floor point and joins both hand endpoints',()=>{
 const base={x:0,y:0,z:0};for(const p of [0,.1,.3,CROSSOVER.bounceFraction,.7,1]){const r=crossoverPoint(base,0,p,1.15,'right'),l=crossoverPoint(base,0,p,1.15,'left');near(r.x,-l.x);near(r.y,l.y);near(r.z,l.z);assert.ok(r.y>=floor-1e-9);assert.ok(r.z>=DRIBBLE.forward-1e-9);}
 const bounce=crossoverPoint(base,0,CROSSOVER.bounceFraction,1.15,'right');near(bounce.x,0);near(bounce.y,floor);near(bounce.z,CROSSOVER.contactForward);
 assert.deepEqual(crossoverPoint(base,0,0,1.15,'right'),dribblePoint(base,0,0,1.15,'right'));assert.deepEqual(crossoverPoint(base,0,1,1.15,'right'),dribblePoint(base,0,0,1.15,'left'));
 const e=1e-4;assert.ok((bounce.y-crossoverPoint(base,0,CROSSOVER.bounceFraction-e,1.15,'right').y)/e<-1);assert.ok((crossoverPoint(base,0,CROSSOVER.bounceFraction+e,1.15,'right').y-bounce.y)/e>1);
});
test('Q at different cycle phases waits for next hand return without resetting ball position',()=>{
 for(const phase of [0,.15,.43,.72,.99]){const s=state(phase),p={...s.ball};assert.ok(requestCrossover(s));assert.deepEqual(s.ball,p);assert.equal(s.playerMotion.crossover?.stage,'WAIT_HAND_RETURN');assert.equal(s.playerMotion.action,'DRIBBLE');let elapsed=0;
 while(s.playerMotion.crossover?.stage==='WAIT_HAND_RETURN'&&elapsed<2){stepGame(s,zeroInput());elapsed+=1/60;}
 assert.ok(Math.abs(elapsed-Math.min((1-phase)*DRIBBLE.idlePeriod,CROSSOVER.maxReturnWait))<1/60+1e-6);assert.equal(s.playerMotion.currentDribbleHand,'right');finish(s);assert.equal(s.playerMotion.currentDribbleHand,'left');}
});
test('a request at the floor continues the existing rise while waiting',()=>{
 const s=state(DRIBBLE.pushFraction);requestCrossover(s);stepGame(s,zeroInput());assert.equal(s.playerMotion.crossover?.stage,'WAIT_HAND_RETURN');assert.ok(s.ball.y>floor&&s.ball.y<s.playerMotion.height);near(s.ball.y,dribblePoint(s.player,0,DRIBBLE.pushFraction+s.playerMotion.crossover!.returnRate/60,s.playerMotion.height).y);
});
test('fresh presses buffer one reverse stroke while auto-repeat and overflow are rejected',()=>{
 const s=state();assert.equal(requestCrossover(s,true),false);requestCrossover(s);assert.equal(requestCrossover(s),false);active(s);
 assert.equal(requestCrossover(s,true),false);assert.ok(requestCrossover(s));assert.equal(requestCrossover(s),false);
 let left=false;for(let n=0;n<100&&s.playerMotion.crossover;n++){stepGame(s,zeroInput());if(s.playerMotion.currentDribbleHand==='left'){left=true;assert.equal(s.playerMotion.action,'CROSSOVER');}}
 assert.ok(left);assert.equal(s.playerMotion.currentDribbleHand,'right');assert.equal(s.playerMotion.crossover,null);
});
test('ownership, charging, gather, catch and air states reject a new Q',()=>{
 for(const owner of ['none','dummy'] as const){const s=state();s.owner=owner;assert.equal(requestCrossover(s),false);}
 for(const start of [startCharge,startPassCharge]){const s=state();start(s);assert.equal(requestCrossover(s),false);for(let n=0;n<20;n++)stepGame(s,zeroInput());assert.equal(requestCrossover(s),false);}
 const catching=state();catching.playerMotion.action='CATCH';assert.equal(requestCrossover(catching),false);
 const air=state();air.player.y=.01;assert.equal(requestCrossover(air),false);air.player.y=0;air.vy=1;assert.equal(requestCrossover(air),false);
});
test('controlled ownership, floor bound, statistics and recovery exclusion hold during crossover',()=>{
 const s=state();s.looseAge=100;requestCrossover(s);for(let n=0;n<100;n++){stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.flightKind,null);assert.ok(s.ball.y>=floor-1e-8);assert.equal(s.acquisitionEvent,null);assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});}assert.deepEqual([s.score,s.made,s.attempts],[0,0,0]);assert.equal(s.looseAge,100);
});
test('walking and sprinting both support a complete crossover',()=>{
 for(const sprint of [false,true]){const s=state();requestCrossover(s);finish(s,{...zeroInput(),z:1,sprint});assert.equal(s.playerMotion.currentDribbleHand,'left');assert.equal(s.owner,'player');assert.ok(s.player.z>-1.5);}
});
test('camera pitch never changes crossover floor height or horizontal path',()=>{
 const a=state(),b=state();requestCrossover(a);requestCrossover(b);for(let n=0;n<100;n++){stepGame(a,{...zeroInput(),pitch:-1.2});stepGame(b,{...zeroInput(),pitch:1.2});assert.deepEqual(a.ball,b.ball);}
});
test('a sudden yaw input cannot teleport the current controlled point and body follows smoothly',()=>{
 const s=state();requestCrossover(s);active(s);for(let n=0;n<4;n++)stepGame(s,zeroInput());const p={...s.ball},beforeYaw=s.playerMotion.dribbleYaw;
 assert.deepEqual(controlledPosition(s,{...zeroInput(),yaw:Math.PI},'player'),p);stepGame(s,{...zeroInput(),yaw:Math.PI});assert.ok(Math.abs(s.playerMotion.dribbleYaw-beforeYaw)<=CROSSOVER.maxYawRate/60+1e-8);assert.ok(Math.hypot(s.ball.x-p.x,s.ball.y-p.y,s.ball.z-p.z)<.25);finish(s,{...zeroInput(),yaw:Math.PI});assert.equal(s.playerMotion.currentDribbleHand,'left');
});
test('jumping after a ground request continues without resetting crossover phase or ownership',()=>{
 const s=state(.9);requestCrossover(s);active(s);const elapsed=s.playerMotion.crossover!.elapsed;stepGame(s,{...zeroInput(),jump:true});assert.ok(s.player.y>0);assert.equal(requestCrossover(s),false);assert.ok(s.playerMotion.crossover!.elapsed>elapsed);for(let n=0;n<70;n++){stepGame(s,zeroInput());assert.ok(s.ball.y>=floor-1e-9);assert.equal(s.owner,'player');}assert.equal(s.playerMotion.currentDribbleHand,'left');
 const p=crossoverPoint({x:0,y:1,z:0},0,CROSSOVER.bounceFraction,1.2,'right');near(p.y,floor);
});
test('both waiting and active switches yield to short shot or pass Gather exactly once',()=>{
 for(const stage of ['waiting','active'])for(const kind of ['shot','pass']){
  const s=state();requestCrossover(s);if(stage==='active')active(s);const p={...s.ball},i={...zeroInput(),yaw:.3,pitch:-.2};
  assert.ok(kind==='shot'?startCharge(s):startPassCharge(s));assert.deepEqual(s.ball,p);assert.equal(s.playerMotion.crossover,null);assert.equal(s.playerMotion.action,'GATHER');assert.ok(kind==='shot'?releaseShot(s,i):releasePass(s,i));assert.equal(kind==='shot'?releaseShot(s,i):releasePass(s,i),false);emit(s,i);assert.equal(s.owner,'none');assert.equal(s.playerMotion.crossover,null);if(kind==='shot')assert.equal(s.attempts,1);else{assert.equal(s.attempts,0);near(s.lastPlayerPass!.speed,PASS.minSpeed);}
 }
});
test('left dribble gathers into the existing right-handed shot form',()=>{
 const s=state();requestCrossover(s);finish(s);assert.equal(s.playerMotion.currentDribbleHand,'left');startCharge(s);for(let n=0;n<20;n++)stepGame(s,zeroInput());const p=characterPose(s,zeroInput(),'player');assert.equal(p.shooting,1);assert.ok(p.rightHand.y<s.ball.y);assert.ok(p.leftHand.x<s.ball.x);assert.equal(s.playerMotion.currentDribbleHand,'left');s.charge=.7;releaseShot(s,zeroInput());emit(s);assert.equal(s.attempts,1);
});
test('left dribble retains manual pass direction and charged speed',()=>{
 const s=state();requestCrossover(s);finish(s);const i={...zeroInput(),yaw:.8,pitch:-.35};startPassCharge(s);s.passCharge=.5;releasePass(s,i);emit(s,i);const d=passDirection(i.yaw,i.pitch);near(s.lastPlayerPass!.speed,passSpeed(.5));assert.deepEqual(s.lastPlayerPass!.direction,d);
});
test('cancel waiting keeps the current cycle and removes its reservation',()=>{
 const s=state(.4),p={...s.ball};requestCrossover(s);cancelAllCharges(s);assert.deepEqual(s.ball,p);assert.equal(s.playerMotion.crossover,null);assert.equal(s.playerMotion.action,'DRIBBLE');for(let n=0;n<150;n++)stepGame(s,zeroInput());assert.equal(s.playerMotion.currentDribbleHand,'right');
});
test('cancel active blends from its actual point back to the committed hand',()=>{
 for(const hand of ['right','left'] as const){const s=state(.9,hand);requestCrossover(s);active(s);for(let n=0;n<8;n++)stepGame(s,zeroInput());const p={...s.ball};cancelAllCharges(s);assert.deepEqual(s.ball,p);assert.equal(s.playerMotion.crossover,null);assert.equal(s.playerMotion.action,'CATCH');for(let n=0;n<100;n++)stepGame(s,zeroInput());assert.equal(s.playerMotion.currentDribbleHand,hand);assert.equal(s.playerMotion.action,'DRIBBLE');}
});
test('ownership loss clears both waiting and active crossover without late hand changes',()=>{
 for(const running of [false,true]){const s=state();requestCrossover(s);if(running)active(s);s.owner='none';s.phase='RESOLVING';s.ball={x:5,y:1,z:0};stepGame(s,zeroInput());assert.equal(s.playerMotion.crossover,null);assert.equal(s.playerMotion.action,'IDLE');assert.equal(s.playerMotion.currentDribbleHand,'right');}
});
test('reset always returns to right hand and normal dribble',()=>{
 const s=state();requestCrossover(s);finish(s);requestCrossover(s);active(s);resetState(s);assert.deepEqual(s,createState());assert.equal(s.playerMotion.currentDribbleHand,'right');assert.equal(s.playerMotion.action,'DRIBBLE');assert.equal(s.playerMotion.crossover,null);
});
test('equal simulation time yields equal switching and post-switch motion at 60 and 120Hz',()=>{
 // Keep this timing comparison away from the existing dummy movement collider.
 function run(dt:number,time:number){const s=state(.27);requestCrossover(s);for(let n=0;n<Math.round(time/dt);n++)stepGame(s,{...zeroInput(),z:1,yaw:-.9,sprint:true},dt);return s;}
 for(const time of [.5,1,1.5]){const a=run(1/60,time),b=run(1/120,time);assert.equal(a.playerMotion.currentDribbleHand,b.playerMotion.currentDribbleHand);assert.equal(a.playerMotion.crossover?.stage,b.playerMotion.crossover?.stage);near(a.playerMotion.crossover?.elapsed??0,b.playerMotion.crossover?.elapsed??0,1e-6);near(a.playerMotion.phase,b.playerMotion.phase,1e-6);near(a.ball.x,b.ball.x,1e-6);near(a.ball.y,b.ball.y,1e-6);near(a.ball.z,b.ball.z,1e-6);}
});
test('receiving hand survives pass, dummy return and catch while dummy never switches itself',()=>{
 const s=state();requestCrossover(s);finish(s);const t=dummyCatchPosition(s),i={...zeroInput(),yaw:Math.atan2(t.x-s.player.x,t.z-s.player.z)};startPassCharge(s);s.passCharge=(12-PASS.minSpeed)/(PASS.maxSpeed-PASS.minSpeed)*PASS.maxCharge;releasePass(s,i);emit(s,i);let dummy=false;
 for(let n=0;n<240;n++){stepGame(s,i);if(s.owner==='dummy')dummy=true;assert.equal(s.dummyMotion.currentDribbleHand,'right');assert.equal(s.dummyMotion.crossover,null);if(dummy&&s.owner==='player')break;}
 assert.ok(dummy);assert.equal(s.owner,'player');for(let n=0;n<20;n++)stepGame(s,i);assert.equal(s.playerMotion.currentDribbleHand,'left');assert.equal(s.playerMotion.action,'DRIBBLE');
});
test('shared pose exposes mirrored hand/wrist and bounded torso/knee weight shift',()=>{
 const s=state(.9);requestCrossover(s);active(s);for(let n=0;n<6;n++)stepGame(s,zeroInput());const p=characterPose(s,zeroInput(),'player');assert.equal(p.crossoverStage,'ACTIVE');assert.ok(p.crossoverProgress>0);assert.ok(Math.abs(p.torsoSide)<=CROSSOVER.bodyShift+1e-8);assert.ok(p.legBend<=CROSSOVER.kneeBend+1e-8);for(const h of [p.rightHand,p.leftHand])assert.ok(Number.isFinite(h.x+h.y+h.z));assert.ok(p.rightWrist!==p.leftWrist);
});

test('successive buffered presses produce left right left with continuous endpoints',()=>{
 const s=state();requestCrossover(s);active(s);requestCrossover(s);let previous={...s.ball},changes=0,hand=s.playerMotion.currentDribbleHand;
 for(let n=0;n<150;n++){stepGame(s,zeroInput());assert.ok(Math.hypot(s.ball.x-previous.x,s.ball.y-previous.y,s.ball.z-previous.z)<.35);assert.ok(s.ball.y>=floor-1e-9);previous={...s.ball};if(s.playerMotion.currentDribbleHand!==hand){changes++;hand=s.playerMotion.currentDribbleHand;if(changes===1)assert.ok(requestCrossover(s));}if(!s.playerMotion.crossover)break;}
 assert.equal(changes,3);assert.equal(hand,'left');assert.equal(s.owner,'player');
});
test('buffered reverse is discarded by cancel, Gather and reset',()=>{
 for(const stop of [cancelAllCharges,startCharge,startPassCharge,resetState]){const s=state();requestCrossover(s);active(s);requestCrossover(s);stop(s);assert.equal(s.playerMotion.crossover,null);for(let n=0;n<100;n++)stepGame(s,zeroInput());assert.equal(s.playerMotion.currentDribbleHand,'right');}
});
