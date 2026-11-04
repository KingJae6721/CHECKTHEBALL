import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, PHYSICS, PRACTICE, rimSegments } from './court.ts';
import { advanceBall, reflectVelocity, solveContacts } from './physics.ts';
import { createState, stepGame, zeroInput, startCharge, releaseShot as requestShot, CFG, rimCrossing } from './simulation.ts';
const ground=COURT.floorY+COURT.ballRadius;
const body=(x=0,y=1,z=0,vx=0,vy=0,vz=0)=>({ball:{x,y,z},ballVelocity:{x:vx,y:vy,z:vz}});
const energy=(b:ReturnType<typeof body>)=>b.ballVelocity.x**2+b.ballVelocity.y**2+b.ballVelocity.z**2;
const near=(a:number,b:number,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`);

test('floor fall rebounds, loses energy, then sleeps without gravity jitter',()=>{
 const b=body(0,1,0,1,-2,0);let bounced=false;
 for(let i=0;i<1200;i++){const vy=b.ballVelocity.y;advanceBall(b,CFG.dt);if(vy<0&&b.ballVelocity.y>0){bounced=true;assert.ok(b.ballVelocity.y<Math.abs(vy)+.2);}assert.ok(b.ball.y>=ground-1e-8);}
 assert.ok(bounced);near(b.ball.y,ground);assert.deepEqual(b.ballVelocity,{x:0,y:0,z:0});
 const p={...b.ball};for(let i=0;i<60;i++)advanceBall(b,CFG.dt);assert.deepEqual(b.ball,p);
});
test('floor corrects deep penetration without reflecting separating velocity',()=>{
 const b=body(0,-3,0,0,2,0);solveContacts(b);assert.ok(b.ball.y>=ground);assert.equal(b.ballVelocity.y,2);
 const separating=body(0,ground-.001,0,0,.1,0);solveContacts(separating);assert.equal(separating.ballVelocity.y,.1);
});
test('ground friction is independent of tick division',()=>{
 const a=body(0,ground,0,3),b=body(0,ground,0,3);
 for(let i=0;i<30;i++)advanceBall(a,1/30);for(let i=0;i<120;i++)advanceBall(b,1/120);
 near(a.ballVelocity.x,b.ballVelocity.x);near(a.ballVelocity.x,3*Math.exp(-PHYSICS.floor.friction));
});
test('finite board reflects a frontal shot',()=>{
 const b=body(0,3.55,5.9,0,0,10);advanceBall(b,CFG.dt,undefined,0);
 assert.ok(b.ballVelocity.z<0);assert.ok(b.ball.z<COURT.board.center.z-COURT.board.depth/2-COURT.ballRadius);
});
test('board edge contact has an outward side normal',()=>{
 const b=body(.96,3.55,6,0,0,8);solveContacts(b);assert.ok(b.ballVelocity.x>0);assert.ok(b.ballVelocity.z<8);
});
test('ball outside board bounds passes without invisible wall',()=>{
 const b=body(1.2,3.55,5.9,0,0,20);advanceBall(b,1/30,undefined,0);assert.equal(b.ballVelocity.z,20);assert.ok(b.ball.z>6.1);
 const above=body(0,4.3,5.9,0,0,20);advanceBall(above,1/30,undefined,0);assert.equal(above.ballVelocity.z,20);
});
test('sphere centre inside board exits its nearest face and remains finite',()=>{
 const b=body(0,3.55,6.1,0,0,-4);solveContacts(b);assert.ok(b.ball.z>=6.1+COURT.board.depth/2+COURT.ballRadius);assert.ok(b.ballVelocity.z>0);assert.ok(Number.isFinite(energy(b)));
});
test('rim reflects contact while the centre opening remains clear',()=>{
 const hit=body(COURT.rimRadius,3.3,5.7,0,-8,0);advanceBall(hit,1/30,undefined,0);assert.ok(hit.ballVelocity.y>0);
 const clear=body(0,3.3,5.7,0,-8,0);advanceBall(clear,1/30,undefined,0);assert.equal(clear.ballVelocity.y,-8);assert.ok(clear.ball.y<COURT.rim.y);
});
test('moving away from board or rim receives no extra impulse',()=>{
 const board=body(0,3.55,5.96,0,0,-3);solveContacts(board);assert.deepEqual(board.ballVelocity,{x:0,y:0,z:-3});
 const rim=body(.24,3.15,5.7,0,3,0);solveContacts(rim);assert.deepEqual(rim.ballVelocity,{x:0,y:3,z:0});
 const v={x:2,y:3,z:4};reflectVelocity(v,{x:0,y:1,z:0},.7);assert.deepEqual(v,{x:2,y:3,z:4});
});
test('maximum supported speed cannot tunnel through board, rim, or floor',()=>{
 const board=body(0,3.55,5,0,0,PHYSICS.maxSpeed);advanceBall(board,PHYSICS.maxStep,undefined,0);assert.ok(board.ballVelocity.z<0);
 const rim=body(.24,4,5.7,0,-PHYSICS.maxSpeed,0);advanceBall(rim,PHYSICS.maxStep,undefined,0);assert.ok(rim.ballVelocity.y>0);
 const floor=body(0,1,0,0,-PHYSICS.maxSpeed,0);advanceBall(floor,PHYSICS.maxStep,undefined,0);assert.ok(floor.ballVelocity.y>0);assert.ok(floor.ball.y>=ground);
});
test('substep travel is bounded by the smallest feature at configured maximum speed',()=>{
 const feature=Math.min(COURT.ballRadius,COURT.board.depth,COURT.rimTubeRadius*2)/2;
 assert.ok(Math.ceil((PHYSICS.maxSpeed+CFG.gravity*PHYSICS.maxStep)*PHYSICS.maxStep/feature)<=PHYSICS.maxSubsteps);
 const b=body(0,10,0,500);advanceBall(b,CFG.dt,undefined,0);near(b.ballVelocity.x,PHYSICS.maxSpeed);
 assert.throws(()=>advanceBall(b,.1),RangeError);
});
test('neighbouring capsule contacts never increase kinetic energy without gravity',()=>{
 for(const {a,b} of rimSegments()) {
   const p={x:(a.x+b.x)/2,y:a.y+.02,z:(a.z+b.z)/2};
   const ball=body(p.x,p.y,p.z,2,-8,3);
   for(let i=0;i<8;i++){const before=energy(ball);solveContacts(ball);assert.ok(energy(ball)<=before+1e-8);}
 }
});
test('rim exact centreline degeneracy remains finite and dissipative',()=>{
 const b=body(.24,3.05,5.7,0,-4,0),before=energy(b);solveContacts(b);assert.ok(Number.isFinite(b.ball.y));assert.ok(energy(b)<=before+1e-8);
});
test('score aperture includes tube, polygon sagitta, and ball radii',()=>{
 const inner=COURT.rimRadius*Math.cos(Math.PI/COURT.rimSegments)-COURT.rimTubeRadius-COURT.ballRadius;
 assert.equal(rimCrossing({x:inner+.001,y:3.2,z:5.7},{x:inner+.001,y:2.9,z:5.7}),false);
 assert.equal(rimCrossing({x:inner-.001,y:3.2,z:5.7},{x:inner-.001,y:2.9,z:5.7}),true);
});
test('corrected rim contact path does not score an obstructed shot',()=>{
 const s=createState();s.phase='IN_FLIGHT';s.owner='none';s.flightKind='shot';s.ball={x:.2,y:3.2,z:5.7};s.ballVelocity={x:0,y:-8,z:0};stepGame(s,zeroInput());assert.equal(s.made,0);assert.ok(s.ballVelocity.y>0);
});
test('made shot continues physics and cannot score twice before return',()=>{
 const s=createState();s.phase='IN_FLIGHT';s.owner='none';s.flightKind='shot';s.ball={x:0,y:3.2,z:5.7};s.ballVelocity={x:0,y:-8,z:0};s.shotPoints=2;
 stepGame(s,zeroInput());stepGame(s,zeroInput());assert.equal(s.made,1);assert.equal(s.phase,'RESOLVING');
 const p={...s.ball};stepGame(s,zeroInput());assert.notDeepEqual(s.ball,p);
 s.ball={x:0,y:3.2,z:5.7};s.ballVelocity={x:0,y:-8,z:0};for(let i=0;i<3;i++)stepGame(s,zeroInput());assert.equal(s.made,1);assert.equal(s.score,2);
});
test('first floor miss stays free for collection and can shoot again after pickup',()=>{
 const s=createState();s.phase='IN_FLIGHT';s.owner='none';s.flightKind='shot';s.ball={x:0,y:ground+.01,z:0};s.ballVelocity={x:0,y:-4,z:0};stepGame(s,zeroInput());
 assert.equal(s.resolved,true);assert.equal(s.phase,'RESOLVING');assert.ok(s.ballVelocity.y>0);const y=s.ball.y;stepGame(s,zeroInput());assert.ok(s.ball.y>y);
 for(let i=0;i<30;i++)stepGame(s,zeroInput());assert.equal(s.phase,'RESOLVING');
 for(let i=0;i<200;i++)stepGame(s,zeroInput());assert.equal(s.owner,'none');assert.equal(s.phase,'RESOLVING');s.ball={x:s.player.x,y:ground,z:s.player.z};s.ballVelocity={x:0,y:0,z:0};stepGame(s,zeroInput());assert.equal(s.phase,'HELD');assert.ok(startCharge(s));s.charge=CFG.idealCharge;assert.ok(releaseShot(s,zeroInput()));assert.equal(s.resolved,false);assert.equal(s.phase,'IN_FLIGHT');
});
test('airborne timeout and out conditions resolve and return within a bound',()=>{
 for(const x of [0,PHYSICS.outDistance+1]) {
  const s=createState();s.phase='IN_FLIGHT';s.owner='none';s.flightKind='shot';s.flight=PHYSICS.maxFlight-.01;s.ball={x,y:100,z:0};
  stepGame(s,zeroInput());if(s.owner==='none'){assert.equal(s.flightKind,null);s.looseAge=PRACTICE.recoverySeconds;stepGame(s,zeroInput());}assert.equal(s.phase,'HELD');assert.equal(s.made,0);
 }
});

// Existing launch-rule scenarios advance through the new controlled gather/release.
function releaseShot(...args:Parameters<typeof requestShot>) {const ok=requestShot(...args);if(ok)for(let i=0;i<60&&args[0].playerMotion.pending;i++)stepGame(args[0],{...args[1],x:0,z:0,jump:false});return ok;}
