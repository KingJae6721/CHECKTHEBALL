import test from 'node:test';
import assert from 'node:assert/strict';
import { PASS, PRACTICE, PHYSICS, PLAYER } from './court.ts';
import { passDirection, passSpeed, playerPassLaunch } from './pass.ts';
import { createState, stepGame, zeroInput, startCharge, releaseShot as requestShot, startPassCharge, releasePass as requestPass, cancelAllCharges, cancelPassCharge, resetState, dummyCatchPosition, type State } from './simulation.ts';
import { advanceBall } from './physics.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function charged(charge=PASS.maxCharge){const s=createState();assert.ok(startPassCharge(s));for(let n=0;n<20&&s.playerMotion.action==='GATHER';n++)stepGame(s,zeroInput());s.passCharge=charge;return s;}

test('yaw and pitch produce normalized camera-aligned direction with positive pitch downward',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-.7])for(const pitch of [-1.2,0,.8]){const v=passDirection(yaw,pitch);near(Math.hypot(v.x,v.y,v.z),1);near(v.x,Math.sin(yaw)*Math.cos(pitch));near(v.y,-Math.sin(pitch));near(v.z,Math.cos(yaw)*Math.cos(pitch));}
 near(passDirection(Math.PI/2,0).x,1);near(passDirection(0,Math.PI/6).y,-.5);near(passDirection(0,-Math.PI/6).y,.5);
});
test('charge maps monotonically to speed and clamps at configured min and max',()=>{
 near(passSpeed(0),PASS.minSpeed);near(passSpeed(PASS.maxCharge/2),(PASS.minSpeed+PASS.maxSpeed)/2);near(passSpeed(PASS.maxCharge),PASS.maxSpeed);near(passSpeed(100),PASS.maxSpeed);near(passSpeed(-10),PASS.minSpeed);
 const a=charged(0),b=charged(PASS.maxCharge);releasePass(a,zeroInput());releasePass(b,zeroInput());near(Math.hypot(a.ballVelocity.x,a.ballVelocity.y,a.ballVelocity.z),PASS.minSpeed);near(Math.hypot(b.ballVelocity.x,b.ballVelocity.y,b.ballVelocity.z),PASS.maxSpeed);
});
test('power saturates while held and never automatically releases',()=>{
 const s=createState();startPassCharge(s);for(let i=0;i<180;i++)stepGame(s,zeroInput());near(s.passCharge,PASS.maxCharge);assert.equal(s.phase,'PASS_CHARGING');assert.equal(s.owner,'player');assert.equal(s.lastPlayerPass,null);assert.equal(s.attempts,0);assert.ok(releasePass(s,zeroInput()));
});
test('release uses the yaw and pitch at release rather than press time',()=>{
 const s=charged(.4),i={...zeroInput(),yaw:.8,pitch:-.3};stepGame(s,zeroInput());assert.ok(releasePass(s,i));const d=passDirection(i.yaw,i.pitch);near(s.ballVelocity.x/s.lastPlayerPass!.speed,d.x);near(s.ballVelocity.y/s.lastPlayerPass!.speed,d.y);near(s.ballVelocity.z/s.lastPlayerPass!.speed,d.z);
});
test('release point lies on camera ray, avoiding sideways parallax on near targets',()=>{
 for(const pitch of [-1.2,0,1.2]){
  const launch=playerPassLaunch({x:2,y:.5,z:-1},{...zeroInput(),yaw:.7,pitch},.4);
  near(launch.origin.y,.5+PLAYER.eyeHeight);
  for(const axis of ['x','y','z'] as const)near(launch.position[axis]-launch.origin[axis],launch.direction[axis]*PASS.releaseOffset);
  const target={x:launch.origin.x+launch.direction.x*.6,y:launch.origin.y+launch.direction.y*.6,z:launch.origin.z+launch.direction.z*.6};
  const distance=Math.hypot(target.x-launch.position.x,target.y-launch.position.y,target.z-launch.position.z);near(distance,.6-PASS.releaseOffset);
 }
});
test('same angle with more power travels further before first floor contact',()=>{
 function range(charge:number){const launch=playerPassLaunch({x:-5,y:0,z:-6},{...zeroInput(),pitch:-.2},charge),body={ball:{...launch.position},ballVelocity:{...launch.velocity}};let landed=false;
  for(let n=0;n<400&&!landed;n++)advanceBall(body,1/60,(_a,_b,floor)=>{if(floor){landed=true;return false;}});
  assert.ok(landed);return body.ball.z-launch.position.z;
 }
 const weak=range(0),strong=range(PASS.maxCharge);assert.ok(strong>weak*2);assert.ok(weak>3);assert.ok(strong>15);
});
test('shot and pass charge switch in either direction without simultaneous charge or stale release',()=>{
 const a=createState();assert.ok(startPassCharge(a));assert.equal(startPassCharge(a),false);a.passCharge=.4;assert.ok(startCharge(a));assert.equal(a.passCharge,0);assert.equal(a.charge,0);assert.equal(releasePass(a,zeroInput()),false);assert.equal(a.phase,'CHARGING');assert.equal(a.playerMotion.pending,null);
 const b=createState();assert.ok(startCharge(b));b.charge=.5;assert.ok(startPassCharge(b));assert.equal(b.charge,0);assert.equal(b.passCharge,0);assert.equal(releaseShot(b,zeroInput()),false);assert.equal(b.phase,'PASS_CHARGING');assert.equal(b.playerMotion.pending,null);
});
test('cancel blocks the eventual mouseup and clears stored power',()=>{
 const s=charged();cancelPassCharge(s);assert.equal(s.passCharge,0);assert.equal(s.phase,'HELD');assert.equal(releasePass(s,zeroInput()),false);assert.equal(s.owner,'player');assert.equal(s.lastPlayerPass,null);
 const both=charged();cancelAllCharges(both);assert.equal(releasePass(both,zeroInput()),false);
});
test('losing ownership cancels power and prevents later release even after regaining ball',()=>{
 const s=charged();s.owner='dummy';s.dummyHold=10;stepGame(s,zeroInput());assert.equal(s.passCharge,0);assert.equal(releasePass(s,zeroInput()),false);s.owner='player';s.phase='HELD';assert.equal(releasePass(s,zeroInput()),false);assert.equal(s.lastPlayerPass,null);
});
test('duplicate release does not emit a second pass or change its trajectory',()=>{
 const s=charged();assert.ok(releasePass(s,zeroInput()));const v={...s.ballVelocity};assert.equal(releasePass(s,{...zeroInput(),pitch:1}),false);assert.deepEqual(s.ballVelocity,v);assert.equal(s.passCharge,0);
});
test('spawn clearance rejects passing through a thin backboard and cancels charge',()=>{
 const s=charged();s.player={x:0,y:3.55-PLAYER.eyeHeight,z:6.3};assert.equal(releasePass(s,{...zeroInput(),yaw:Math.PI}),false);assert.equal(s.owner,'player');assert.equal(s.phase,'HELD');assert.equal(s.passCharge,0);assert.equal(releasePass(s,zeroInput()),false);
});
test('maximum speed pass bounces off the board without tunnelling',()=>{
 const s=charged();s.player={x:0,y:3.55-PLAYER.eyeHeight,z:5.15};assert.ok(releasePass(s,zeroInput()));stepGame(s,zeroInput(),PHYSICS.maxStep);assert.ok(s.ballVelocity.z<0);assert.ok(s.ball.z<6.1);assert.equal(s.owner,'none');
});
test('maximum speed pass bounces off the rim without tunnelling',()=>{
 const s=charged();s.player={x:.24,y:4-PLAYER.eyeHeight,z:5.7};assert.ok(releasePass(s,{...zeroInput(),pitch:Math.PI/2}));stepGame(s,zeroInput(),PHYSICS.maxStep);assert.ok(s.ballVelocity.y>0);assert.equal(s.owner,'none');
});
test('dummy catches a maximum power pass and zeroes its velocity',()=>{
 const s=charged(),t=dummyCatchPosition(s),i={...zeroInput(),yaw:Math.atan2(t.x-s.player.x,t.z-s.player.z)};assert.ok(releasePass(s,i));
 for(let n=0;n<80&&s.owner==='none';n++)stepGame(s,i);assert.equal(s.owner,'dummy');assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});assert.ok(PRACTICE.catchSpeed>PASS.maxSpeed);
});
test('manual strong pass reaches a distant dummy while weak pass at same angle falls short',()=>{
 function scenario(charge:number){const s=charged(charge);s.player={x:-5,y:0,z:-6};const t=dummyCatchPosition(s),i={...zeroInput(),yaw:Math.atan2(t.x-s.player.x,t.z-s.player.z),pitch:-.08};assert.ok(releasePass(s,i));let caught=false;
  for(let n=0;n<80;n++){stepGame(s,i);if(s.owner==='dummy'){caught=true;break;}}return caught;
 }
 assert.equal(scenario(0),false);assert.equal(scenario(PASS.maxCharge),true);
});
test('dummy location and hint cannot modify a player manual velocity',()=>{
 const a=charged(.6),b=charged(.6);b.player={x:-5,y:0,z:-6};const i={...zeroInput(),yaw:.4,pitch:-.15};releasePass(a,i);releasePass(b,i);assert.deepEqual(a.ballVelocity,b.ballVelocity);
});
test('horizontal velocity remains fixed after release rather than homing',()=>{
 const s=charged();releasePass(s,{...zeroInput(),yaw:.5,pitch:-.3});const v={...s.ballVelocity};s.player.x=-6;s.player.z=-6;stepGame(s,zeroInput());near(s.ballVelocity.x,v.x);near(s.ballVelocity.z,v.z);assert.ok(s.ballVelocity.y<v.y);
});
test('charging and passing never change shot statistics or score',()=>{
 const s=charged();s.score=5;s.made=2;s.attempts=4;for(let n=0;n<10;n++)stepGame(s,zeroInput());releasePass(s,{...zeroInput(),pitch:-.2});for(let n=0;n<15;n++)stepGame(s,zeroInput());assert.deepEqual([s.score,s.made,s.attempts],[5,2,4]);
});
test('reset clears pass charge and launch diagnostic history',()=>{
 const s=charged();releasePass(s,zeroInput());resetState(s);assert.deepEqual(s,createState());const p=charged();resetState(p);assert.equal(releasePass(p,zeroInput()),false);assert.equal(p.passCharge,0);
});

test('launch diagnostic preserves initial release position and velocity while ball moves',()=>{
 const s=charged();releasePass(s,{...zeroInput(),yaw:.4,pitch:-.2});const launch=structuredClone(s.lastPlayerPass);for(let n=0;n<5;n++)stepGame(s,zeroInput());assert.deepEqual(s.lastPlayerPass,launch);assert.notDeepEqual(s.ball,launch!.position);
});

// Existing launch-rule scenarios advance through the new controlled gather/release.
function releaseShot(...args:Parameters<typeof requestShot>) {const ok=requestShot(...args);if(ok)for(let i=0;i<60&&args[0].playerMotion.pending;i++)stepGame(args[0],{...args[1],x:0,z:0,jump:false});return ok;}

// Existing launch-rule scenarios advance through the new controlled gather/release.
function releasePass(...args:Parameters<typeof requestPass>) {const ok=requestPass(...args);if(ok)for(let i=0;i<60&&args[0].playerMotion.pending;i++)stepGame(args[0],{...args[1],x:0,z:0,jump:false});return ok;}
