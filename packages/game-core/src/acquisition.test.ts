import test from 'node:test';
import assert from 'node:assert/strict';
import { ACQUISITION, COURT, PRACTICE } from './court.ts';
import { acquisitionVolumes, outsideAcquisitionVolumes, evaluateAcquisition, passCatchPoint } from './acquisition.ts';
import { createState, resetState, stepGame, zeroInput, tryAcquireBall, startCharge, releaseShot as requestShot, CFG, type State } from './simulation.ts';
const ground=COURT.floorY+COURT.ballRadius;
function free(y=1.1,z=.6) { const s=createState();s.owner='none';s.phase='RESOLVING';s.flightKind=null;s.player={x:0,y:0,z:0};s.ball={x:0,y,z};s.ballVelocity={x:0,y:0,z:0};s.releaseAge=1;return s; }
function shot() {const s=free();s.phase='IN_FLIGHT';s.flightKind='shot';s.passFrom='player';s.attempts=1;return s;}

test('passes reach feet and just above the head but not behind or far overhead',()=>{
 for(const y of [.2,.7,1.3,2.1]){
  const s=free(y);s.flightKind='pass';s.passFrom='dummy';s.ballVelocity.z=-22;
  assert.ok(passCatchPoint(s,zeroInput(),s.ball,s.ball));
  assert.deepEqual([s.score,s.made,s.attempts],[0,0,0]);
 }
 for(const p of [{x:0,y:2.4,z:.6},{x:0,y:1.2,z:-.3}]){
  const s=free();s.flightKind='pass';assert.equal(passCatchPoint(s,zeroInput(),p,p),null);
 }
});

test('online chase reach requires actual forward movement and has a fixed cap',()=>{
 const s=free(1.1,1.9);s.networked=true;s.ballVelocity.z=6;
 assert.equal(evaluateAcquisition(s,zeroInput()).reason,null);
 s.locomotion.velocity.z=6;assert.equal(evaluateAcquisition(s,zeroInput()).reason,'AIR_CATCH');
 s.ball.z=ACQUISITION.air.maxForward+ACQUISITION.chase.maxExtraForward+COURT.ballRadius+.01;
 assert.equal(evaluateAcquisition(s,zeroInput()).reason,null);
 s.ball.z=1.9;s.locomotion.velocity.z=-6;assert.equal(evaluateAcquisition(s,zeroInput()).reason,null);
});

test('expanded pass reach sweeps fast paths without taking an owned ball',()=>{
 const s=free();s.flightKind='pass';s.ballVelocity.x=22;
 const a={x:-2,y:2.1,z:.6},b={x:2,y:2.1,z:.6};
 assert.ok(passCatchPoint(s,zeroInput(),a,b));
 s.owner='dummy';assert.equal(passCatchPoint(s,zeroInput(),a,b),null);
});

test('foot volume picks up a moving floor ball well above the old 2m/s cap',()=>{
 const s=free(ground,.4);s.ballVelocity.x=8;assert.ok(tryAcquireBall(s,zeroInput()));assert.equal(s.owner,'player');assert.equal(s.acquisitionEvent?.reason,'GROUND_PICKUP');assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});
});
test('free rising and falling bounces are caught in front of the torso',()=>{
 for(const vy of [7,-7]){const s=free();s.ballVelocity.y=vy;stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');}
});
test('air volume excludes overhead, behind and side balls at short distance',()=>{
 for(const p of [{x:0,y:ACQUISITION.air.maxHeight+COURT.ballRadius+.01,z:.6},{x:0,y:1.1,z:-.2},{x:ACQUISITION.air.halfWidth+COURT.ballRadius+.01,y:1.1,z:.6}]){
  const s=free();s.ball=p;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'OUTSIDE_VOLUMES');
 }
 const behindFeet=free(ground,-.5);assert.equal(tryAcquireBall(behindFeet,zeroInput()),false);
});
test('torso acquisition follows horizontal aim but not camera pitch',()=>{
 const s=free();s.ball={x:.6,y:1.1,z:0};assert.equal(evaluateAcquisition(s,zeroInput()).reason,null);assert.equal(evaluateAcquisition(s,{...zeroInput(),yaw:Math.PI/2,pitch:-1.2}).reason,'AIR_CATCH');
});
test('ground and air each enforce their configured maximum speed',()=>{
 for(const [y,max] of [[ground,ACQUISITION.ground.maxSpeed],[1.1,ACQUISITION.air.maxSpeed]]){
  const s=free(y);s.ballVelocity.x=max+.1;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'TOO_FAST');
 }
});
test('own release cannot be reacquired immediately even after contact',()=>{
 const s=createState();startCharge(s);s.charge=CFG.idealCharge;releaseShot(s,zeroInput());s.shotTouched=true;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'RELEASE_LOCK');assert.equal(s.owner,'none');
});
test('airball must leave the whole volume including its radius and then descend',()=>{
 const s=shot();s.ballVelocity.y=-4;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'AIRBALL_NOT_LEFT');
 const p={x:0,y:ACQUISITION.air.maxHeight+COURT.ballRadius-.001,z:.6};assert.equal(outsideAcquisitionVolumes(s,zeroInput(),p),false);p.y+=.002;assert.equal(outsideAcquisitionVolumes(s,zeroInput(),p),true);
 s.shotExited=true;s.ballVelocity.y=4;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'AIRBALL_RISING');
 s.ballVelocity.y=-4;assert.ok(tryAcquireBall(s,zeroInput()));assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');assert.equal(s.resolved,true);assert.deepEqual([s.attempts,s.made,s.score],[1,0,0]);
});
test('actual descending untouched shot records exit before returning to front catch region',()=>{
 const s=shot();s.ball={x:0,y:ACQUISITION.air.maxHeight+COURT.ballRadius+.05,z:.6};s.ballVelocity={x:0,y:-5,z:0};
 for(let n=0;n<10&&s.owner==='none';n++)stepGame(s,zeroInput());assert.equal(s.shotExited,true);assert.equal(s.shotTouched,false);assert.equal(s.owner,'player');assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');
});
test('airball still inside the shooter region cannot be caught by time alone',()=>{
 const s=shot();s.releaseAge=100;s.ballVelocity.y=-1;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'AIRBALL_NOT_LEFT');
});
test('first floor impact can be acquired immediately without waiting for repeated bounces',()=>{
 const s=shot();s.ball={x:0,y:ground+.005,z:.4};s.ballVelocity={x:0,y:-6,z:0};stepGame(s,zeroInput());assert.equal(s.shotTouched,true);assert.equal(s.owner,'player');assert.equal(s.acquisitionEvent?.reason,'GROUND_PICKUP');assert.equal(s.acquisitionEvent?.tick,1);
});
test('board contact makes an unresolved own shot recoverable',()=>{
 const s=shot();s.player={x:0,y:2.27,z:5};s.ball={x:0,y:3.55,z:5.93};s.ballVelocity={x:0,y:0,z:8};
 for(let n=0;n<5&&s.owner==='none';n++)stepGame(s,zeroInput());assert.equal(s.shotTouched,true);assert.equal(s.owner,'player');assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');
});
test('rim contact records eligibility independently of ascent or airball exit',()=>{
 const s=shot();s.player={x:0,y:0,z:-1.5};s.ball={x:.24,y:3.2,z:5.7};s.ballVelocity={x:0,y:-8,z:0};
 stepGame(s,zeroInput());assert.equal(s.shotTouched,true);
 s.player={x:0,y:0,z:0};s.ball={x:0,y:1.1,z:.6};s.ballVelocity={x:0,y:5,z:0};s.shotExited=false;assert.ok(tryAcquireBall(s,zeroInput()));assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');
});
test('resolved shot is recoverable without a contact or exit requirement',()=>{
 const s=shot();s.resolved=true;s.ballVelocity.y=5;assert.ok(tryAcquireBall(s,zeroInput()));assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');
});
test('swept acquisition catches a fast free ball through the volume with both endpoints outside',()=>{
 const s=free();s.ballVelocity.x=16;const a={x:-2,y:1.1,z:.6},b={x:2,y:1.1,z:.6};assert.ok(tryAcquireBall(s,zeroInput(),a,b));assert.equal(s.acquisitionEvent?.reason,'AIR_CATCH');
});
test('other owners and unsupported shots never become player rebounds',()=>{
 for(const owner of ['dummy','player'] as const){const s=free();s.owner=owner;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.owner,owner);}
 const s=shot();s.passFrom='dummy';s.shotTouched=true;assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'UNSUPPORTED_SHOT');
});
test('active passes use their original catch path rather than new acquisition volumes',()=>{
 const s=free();s.flightKind='pass';s.passFrom='dummy';assert.equal(tryAcquireBall(s,zeroInput()),false);assert.equal(s.acquisitionBlock,'PASS_IN_FLIGHT');
});
test('catch volumes cannot reach through a board even with a forward anchor on the far side',()=>{
 const s=free();s.player={x:0,y:2.27,z:6.4};s.ball={x:0,y:3.55,z:5.9};const input={...zeroInput(),yaw:Math.PI};assert.equal(tryAcquireBall(s,input),false);assert.equal(s.acquisitionBlock,'OBSTRUCTED');
});
test('swept acquisition cannot catch through board geometry',()=>{
 const s=free();s.player={x:0,y:2.27,z:6.6};s.ball={x:0,y:3.55,z:6.4};s.ballVelocity.z=12;assert.equal(tryAcquireBall(s,zeroInput(),{x:0,y:3.55,z:5.5},{x:0,y:3.55,z:7}),false);
});
test('out-of-bounds event records actual elapsed time and position before teleport',()=>{
 const s=free();s.ball.x=12.1;s.flight=2.3;stepGame(s,zeroInput());assert.equal(s.acquisitionEvent?.reason,'OUT_OF_BOUNDS');assert.ok(s.acquisitionEvent!.flightSeconds>2.3);assert.ok(s.acquisitionEvent!.position.x>12);assert.equal(s.owner,'player');
});
test('long-unclaimed free ball records RECOVERY_TIMEOUT, not a short bounce timer',()=>{
 const s=free(ground);s.ball.x=5;for(let i=0;i<300;i++)stepGame(s,zeroInput());assert.equal(s.owner,'none');assert.equal(Boolean(s.acquisitionEvent),false);
 s.looseAge=PRACTICE.recoverySeconds;stepGame(s,zeroInput());assert.equal(s.acquisitionEvent?.reason,'RECOVERY_TIMEOUT');assert.ok(s.acquisitionEvent!.looseSeconds>=30);
});
test('initial perfect shot returning after a few seconds is OUT_OF_BOUNDS',()=>{
 const s=createState();startCharge(s);s.charge=CFG.idealCharge;releaseShot(s,zeroInput());for(let i=0;i<300&&s.owner==='none';i++)stepGame(s,zeroInput());assert.equal(s.acquisitionEvent?.reason,'OUT_OF_BOUNDS');assert.ok(s.acquisitionEvent!.flightSeconds<5);
});
test('reset clears eligibility history and acquisition diagnostics',()=>{
 const s=free();s.shotTouched=true;s.shotExited=true;tryAcquireBall(s,zeroInput());resetState(s);assert.deepEqual(s,createState());
});
test('debug geometry and core geometry share the same rotated dimensions',()=>{
 const s=free(),volumes=acquisitionVolumes(s,{...zeroInput(),yaw:Math.PI/2});assert.equal(volumes[1].size.x,ACQUISITION.air.halfWidth*2);assert.ok(Math.abs(volumes[1].center.x-(ACQUISITION.air.minForward+ACQUISITION.air.maxForward)/2)<1e-8);assert.ok(Math.abs(volumes[1].center.z)<1e-8);
});

// Existing launch-rule scenarios advance through the new controlled gather/release.
function releaseShot(...args:Parameters<typeof requestShot>) {const ok=requestShot(...args);if(ok)for(let i=0;i<60&&args[0].playerMotion.pending;i++)stepGame(args[0],{...args[1],x:0,z:0,jump:false});return ok;}
