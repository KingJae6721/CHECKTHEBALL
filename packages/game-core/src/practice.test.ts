import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, DUMMY, PRACTICE, PHYSICS, ACQUISITION, PASS } from './court.ts';
import { createState, resetState, stepGame, zeroInput, startPassCharge, releasePass, startCharge, releaseShot, tryPickup, catchPass, dummyCatchPosition, playerCatchPosition, isAimingAtDummy, CFG, type State } from './simulation.ts';
const ground=COURT.floorY+COURT.ballRadius;
// Legacy scenarios now use the press/release API at an explicit 12m/s setting.
function passBall(s:State,input:ReturnType<typeof zeroInput>) {if(!startPassCharge(s))return false;s.passCharge=(12-PASS.minSpeed)/(PASS.maxSpeed-PASS.minSpeed)*PASS.maxCharge;const ok=releasePass(s,input);if(ok)for(let n=0;n<60&&s.playerMotion.pending;n++)stepGame(s,{...input,x:0,z:0,jump:false});return ok;}
function loose() {const s=createState();s.owner='none';s.phase='RESOLVING';s.flightKind=null;s.ball={x:s.player.x,y:ground,z:s.player.z};s.ballVelocity={x:0,y:0,z:0};s.releaseAge=1;return s;}
function aimed(s:State) {const i=zeroInput(),t=dummyCatchPosition(s);i.yaw=Math.atan2(t.x-s.player.x,t.z-s.player.z);return i;}
function toDummy() {const s=createState(),i=aimed(s);assert.ok(passBall(s,i));for(let n=0;n<100&&s.owner!=='dummy';n++)stepGame(s,i);assert.equal(s.owner,'dummy');return {s,i};}
function toReturn() {const {s,i}=toDummy();for(let n=0;n<100&&s.owner==='dummy';n++)stepGame(s,i);assert.equal(s.flightKind,'pass');assert.equal(s.passFrom,'dummy');return {s,i};}

test('nearby low slow free ball is picked up and attached at normal held position',()=>{
 const s=loose();stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.phase,'HELD');assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});const caught=s.ball.y;for(let n=0;n<12;n++)stepGame(s,zeroInput());assert.ok(s.ball.y>caught);assert.equal(s.dummyHold,0);
});
test('pickup enforces independent distance, height and speed thresholds',()=>{
 const far=loose();far.ball.x+=ACQUISITION.ground.halfWidth+COURT.ballRadius+.01;assert.equal(tryPickup(far),false);
 const high=loose();high.ball.y=COURT.floorY+ACQUISITION.ground.maxHeight+COURT.ballRadius+.01;assert.equal(tryPickup(high),false);
 const fast=loose();fast.ballVelocity.x=ACQUISITION.ground.maxSpeed+.01;assert.equal(tryPickup(fast),false);
 const jumping=loose();jumping.player.y=.5;assert.equal(tryPickup(jumping),false);
});
test('owned balls and active shot flights cannot be stolen or picked up',()=>{
 for(const owner of ['dummy','player'] as const){const s=loose();s.owner=owner;assert.equal(tryPickup(s),false);assert.equal(s.owner,owner);}
 const s=loose();s.flightKind='shot';s.phase='IN_FLIGHT';assert.equal(tryPickup(s),false);
});
test('release lock blocks immediate self pickup and self catch',()=>{
 const s=loose();s.passFrom='player';s.releaseAge=0;assert.equal(tryPickup(s),false);s.releaseAge=PRACTICE.releaseLock;assert.equal(tryPickup(s),true);
 const p=createState();assert.ok(passBall(p,zeroInput()));const target=playerCatchPosition(p);p.ballVelocity={x:0,y:0,z:1};assert.equal(catchPass(p,target,target),false);assert.equal(p.owner,'none');
});
test('passes require ownership, replace shot charge and reject repeated release',()=>{
 for(const owner of ['none','dummy'] as const){const s=createState();s.owner=owner;assert.equal(passBall(s,zeroInput()),false);}
 const s=createState();startCharge(s);assert.ok(passBall(s,zeroInput()));assert.equal(s.flightKind,'pass');assert.equal(s.attempts,0);
 const p=createState();assert.ok(passBall(p,zeroInput()));assert.equal(passBall(p,zeroInput()),false);assert.equal(startCharge(p),false);assert.equal(releaseShot(p,zeroInput()),false);
});
test('losing ownership while charging cancels charge',()=>{
 const s=createState();startCharge(s);s.charge=.5;s.owner='none';stepGame(s,zeroInput());assert.equal(s.charge,0);assert.notEqual(s.phase,'CHARGING');assert.equal(releaseShot(s,zeroInput()),false);
});
test('aim hint never modifies the manual pass direction',()=>{
 const s=createState(),i=aimed(s);assert.ok(isAimingAtDummy(s,i));assert.ok(passBall(s,i));assert.ok(Math.abs(Math.atan2(s.ballVelocity.x,s.ballVelocity.z)-i.yaw)<1e-10);
 const miss=createState(),away={...zeroInput(),yaw:-Math.PI/2};assert.equal(isAimingAtDummy(miss,away),false);passBall(miss,away);assert.ok(miss.ballVelocity.x<0);assert.ok(Math.abs(miss.ballVelocity.z)<1e-8);assert.ok(Math.abs(miss.ballVelocity.y)<1e-8);
});
test('dummy catches, waits, returns and player catches with zero residual speed',()=>{
 const {s,i}=toDummy();assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});assert.ok(s.dummyHold>0);
 for(let n=0;n<10;n++)stepGame(s,i);assert.equal(s.owner,'dummy');
 let returned=false;for(let n=0;n<160;n++){stepGame(s,i);if(s.passFrom==='dummy')returned=true;if(returned&&String(s.owner)==='player')break;}
 assert.ok(returned);assert.equal(s.owner,'player');assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});assert.equal(s.dummyHold,0);
 assert.deepEqual([s.attempts,s.made,s.score],[0,0,0]);
});
test('return aims at player position at launch and never homes after release',()=>{
 const {s,i}=toDummy();s.player.x=-1;s.player.z=-2;
 for(let n=0;n<100&&s.owner==='dummy';n++)stepGame(s,i);
 const dx=s.player.x-s.ball.x,dz=s.player.z-s.ball.z;assert.ok(Math.abs(s.ballVelocity.x*dz-s.ballVelocity.z*dx)<1e-7);
 const v={...s.ballVelocity};s.player.x=-6;s.player.z=6;stepGame(s,i);
 assert.ok(Math.abs(s.ballVelocity.x-v.x)<1e-9);assert.ok(Math.abs(s.ballVelocity.z-v.z)<1e-9);
});
test('moving away misses return and leaves recoverable free ball',()=>{
 const {s,i}=toReturn();s.player.x=6;s.player.z=-6;
 for(let n=0;n<90;n++)stepGame(s,i);
 assert.equal(s.owner,'none');assert.equal(s.flightKind,null);assert.equal(s.phase,'RESOLVING');assert.ok(s.looseAge<PRACTICE.recoverySeconds);
});
test('unassisted missed pass becomes a free ball without changing shot statistics',()=>{
 const s=createState();s.score=4;s.attempts=3;s.made=2;const i={...zeroInput(),yaw:-Math.PI/2};passBall(s,i);
 for(let n=0;n<45;n++)stepGame(s,i);assert.equal(s.owner,'none');assert.equal(s.flightKind,null);assert.deepEqual([s.score,s.attempts,s.made],[4,3,2]);
});
test('pass through scoring aperture never scores or counts as a shot',()=>{
 const s=loose();s.phase='IN_FLIGHT';s.flightKind='pass';s.passFrom='dummy';s.ball={x:0,y:3.2,z:5.7};s.ballVelocity={x:0,y:-8,z:0};
 for(let n=0;n<5;n++)stepGame(s,zeroInput());assert.deepEqual([s.score,s.attempts,s.made],[0,0,0]);
});
test('swept catch works when both path endpoints lie outside receiver volume',()=>{
 const s=loose();s.phase='IN_FLIGHT';s.flightKind='pass';s.passFrom='player';s.ballVelocity={x:12,y:0,z:0};const t=dummyCatchPosition(s);
 assert.ok(catchPass(s,{x:t.x-1,y:t.y,z:t.z},{x:t.x+1,y:t.y,z:t.z}));assert.equal(s.owner,'dummy');assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});
});
test('catch rejects height, speed, wrong flight kind, ownership and distant passes',()=>{
 for(const kind of ['height','speed','shot','owned','distance']) {
  const s=loose();s.phase='IN_FLIGHT';s.flightKind='pass';s.passFrom='player';const t=dummyCatchPosition(s);let a={...t};
  if(kind==='height')a.y=DUMMY.position.y+ACQUISITION.air.maxHeight+COURT.ballRadius+.1;
  if(kind==='speed')s.ballVelocity.x=PRACTICE.catchSpeed+1;
  if(kind==='shot')s.flightKind='shot';
  if(kind==='owned')s.owner='player';
  if(kind==='distance')a.x+=10;
  assert.equal(catchPass(s,a,a),false,kind);
 }
});
test('receiver cannot catch through board or rim even if catch sphere overlaps solid',()=>{
 const board=loose();board.player={x:0,y:3.55-PRACTICE.playerCatchY,z:6.3};board.flightKind='pass';board.passFrom='dummy';board.ballVelocity={x:0,y:0,z:2};
 assert.equal(catchPass(board,{x:0,y:3.55,z:5.88},{x:0,y:3.55,z:5.9}),false);
 const rim=loose();rim.player={x:.24,y:3.05-PRACTICE.playerCatchY,z:5.7};rim.flightKind='pass';rim.passFrom='dummy';rim.ballVelocity={x:0,y:-2,z:0};
 assert.equal(catchPass(rim,{x:.24,y:3.3,z:5.7},{x:.24,y:3.25,z:5.7}),false);
});
test('integrated fast pass respects board collision before catch',()=>{
 const s=loose();s.player={x:0,y:3.55-PRACTICE.playerCatchY,z:6.7};s.phase='IN_FLIGHT';s.flightKind='pass';s.passFrom='dummy';s.ball={x:0,y:3.55,z:5.5};s.ballVelocity={x:0,y:0,z:16};
 for(let n=0;n<5;n++)stepGame(s,zeroInput());assert.equal(s.owner,'none');assert.ok(s.ballVelocity.z<0);
});
test('ordinary free ball remains available beyond previous short return timer',()=>{
 const s=loose();s.ball.x=5;for(let n=0;n<600;n++)stepGame(s,zeroInput());assert.equal(s.owner,'none');assert.equal(s.phase,'RESOLVING');assert.ok(s.looseAge>=9.9);
});
test('only out-of-bounds or long-unclaimed balls trigger safety recovery',()=>{
 for(const kind of ['out','timeout']){const s=loose();s.ball.x=kind==='out'?PHYSICS.outDistance+1:5;s.looseAge=kind==='timeout'?PRACTICE.recoverySeconds:0;stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.dummyHold,0);}
});
test('reset clears dummy ownership, hold reservation and all in-flight state',()=>{
 const {s}=toDummy();assert.ok(s.dummyHold>0);resetState(s);assert.deepEqual(s,createState());
 for(let n=0;n<180;n++)stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.dummyHold,0);assert.equal(s.flightKind,null);assert.equal(s.passFrom,'none');
});
test('player movement cannot overlap fixed dummy',()=>{
 const s=createState();s.player.x=DUMMY.position.x;s.player.z=DUMMY.position.z;stepGame(s,zeroInput());assert.ok(Math.hypot(s.player.x-DUMMY.position.x,s.player.z-DUMMY.position.z)>=PRACTICE.playerRadius+DUMMY.collisionRadius-1e-8);
});

test('forward release offset cannot spawn a pass through a thin board',()=>{
 const s=createState();s.player={x:0,y:3.55-PRACTICE.playerCatchY,z:6.3};
 const input={...zeroInput(),yaw:Math.PI};assert.equal(passBall(s,input),false);
 assert.equal(s.owner,'player');assert.equal(s.flightKind,null);assert.deepEqual([s.score,s.attempts,s.made],[0,0,0]);
});
