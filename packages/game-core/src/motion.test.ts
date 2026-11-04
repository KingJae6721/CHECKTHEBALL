import test from 'node:test';
import assert from 'node:assert/strict';
import {COURT,DRIBBLE,CHARACTER,PASS,PRACTICE} from './court.ts';
import {dribblePoint,controlledPosition,characterPose,releaseSocket} from './motion.ts';
import {passSpeed} from './pass.ts';
import {createState,zeroInput,stepGame,startCharge,releaseShot,startPassCharge,releasePass,cancelAllCharges,resetState,tryAcquireBall,dummyCatchPosition,type State} from './simulation.ts';
const near=(a:number,b:number,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function finish(s:State,input=zeroInput()){for(let n=0;n<80&&s.playerMotion.pending;n++)stepGame(s,input);assert.equal(s.playerMotion.pending,null);}
function atBottom(){const s=createState();s.playerMotion.phase=DRIBBLE.pushFraction;s.ball=dribblePoint(s.player,0,s.playerMotion.phase);return s;}

test('dribble remains controlled, never enters free-ball, score or recovery rules',()=>{
 const s=createState();s.looseAge=100;
 for(let n=0;n<600;n++){stepGame(s,{...zeroInput(),z:n<200?0:1,sprint:n>=400,jump:n===210});assert.equal(s.owner,'player');assert.equal(s.flightKind,null);assert.equal(s.acquisitionEvent,null);assert.ok(s.ball.y>=COURT.floorY+COURT.ballRadius-1e-9);assert.deepEqual(s.ballVelocity,{x:0,y:0,z:0});}
 assert.deepEqual([s.score,s.attempts,s.made],[0,0,0]);assert.equal(s.looseAge,100);assert.equal(s.playerMotion.action,'DRIBBLE');
});
test('controlled bounce touches exact floor with nonzero incoming and outgoing slopes',()=>{
 const p=DRIBBLE.pushFraction,e=1e-4,a=dribblePoint({x:0,y:0,z:0},0,p-e),b=dribblePoint({x:0,y:0,z:0},0,p),c=dribblePoint({x:0,y:0,z:0},0,p+e);
 near(b.y,COURT.floorY+COURT.ballRadius);assert.ok((b.y-a.y)/e<-1);assert.ok((c.y-b.y)/e>1);assert.ok(a.y>b.y&&c.y>b.y);
});
test('dribble phase, height and tempo match for equal simulation time at 60 and 120Hz',()=>{
 const run=(dt:number)=>{const s=createState();for(const input of [zeroInput(),{...zeroInput(),z:1},{...zeroInput(),z:1,sprint:true}])for(let n=0;n<Math.round(.5/dt);n++)stepGame(s,input,dt);return s;};
 const a=run(1/60),b=run(1/120);near(a.playerMotion.phase,b.playerMotion.phase);near(a.playerMotion.rate,b.playerMotion.rate);near(a.playerMotion.height,b.playerMotion.height);near(a.ball.y,b.ball.y);near(a.ball.z,b.ball.z);
});
test('moving and sprinting change tempo smoothly rather than jumping the phase',()=>{
 const s=createState(),rate=s.playerMotion.rate;stepGame(s,{...zeroInput(),z:1,sprint:true});assert.ok(s.playerMotion.rate>rate&&s.playerMotion.rate<1/DRIBBLE.sprintPeriod);const first=s.playerMotion.rate;for(let n=0;n<50;n++)stepGame(s,{...zeroInput(),z:1,sprint:true});assert.ok(s.playerMotion.rate>first);near(1/s.playerMotion.rate,DRIBBLE.sprintPeriod,.001);
});
test('short shot click gathers from the floor continuously and fires exactly once',()=>{
 const s=atBottom(),initial={...s.ball};assert.ok(startCharge(s));assert.deepEqual(s.ball,initial);assert.ok(releaseShot(s,zeroInput()));assert.equal(releaseShot(s,zeroInput()),false);assert.equal(s.attempts,0);stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.ok(s.ball.y>initial.y&&s.ball.y<.3);near(s.charge,0);finish(s);assert.equal(s.owner,'none');assert.equal(s.attempts,1);assert.equal(s.playerMotion.action,'RELEASE');assert.equal(s.playerMotion.fired,true);assert.deepEqual(s.ball,s.playerMotion.releasePoint);assert.equal(releaseShot(s,zeroInput()),false);
});
test('short pass stores charge and release direction until gather and visual release finish',()=>{
 const s=atBottom(),i={...zeroInput(),yaw:.6,pitch:-.2};startPassCharge(s);s.passCharge=.07;assert.ok(releasePass(s,i));assert.equal(s.owner,'player');const stored=s.playerMotion.pending!;near(stored.charge,.07);finish(s,{...zeroInput(),yaw:-1,pitch:.8});assert.equal(s.owner,'none');near(s.lastPlayerPass!.speed,passSpeed(.07));near(s.lastPlayerPass!.direction.y,Math.sin(.2));assert.deepEqual(s.ball,s.lastPlayerPass!.position);assert.deepEqual(s.ball,s.playerMotion.releasePoint);assert.deepEqual([s.score,s.attempts,s.made],[0,0,0]);
});
test('charge release remains reserved during gathering and blocks the other input',()=>{
 const s=atBottom();startPassCharge(s);releasePass(s,zeroInput());assert.equal(startCharge(s),false);assert.equal(startPassCharge(s),false);assert.equal(releasePass(s,zeroInput()),false);for(let n=0;n<5;n++)stepGame(s,zeroInput());assert.equal(s.playerMotion.action,'GATHER');assert.equal(s.owner,'player');assert.ok(s.playerMotion.pending);
});
test('cancel during Gather removes the queued release without snapping to the hand',()=>{
 const s=atBottom();startCharge(s);releaseShot(s,zeroInput());stepGame(s,zeroInput());const p={...s.ball};cancelAllCharges(s);assert.deepEqual(s.ball,p);assert.equal(s.playerMotion.pending,null);assert.equal(s.playerMotion.action,'CATCH');for(let n=0;n<80;n++)stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.attempts,0);assert.equal(releaseShot(s,zeroInput()),false);
});
test('cancel during release wind-up also prevents an eventual emission',()=>{
 const s=createState();startPassCharge(s);for(let n=0;n<20;n++)stepGame(s,zeroInput());releasePass(s,zeroInput());stepGame(s,zeroInput());assert.equal(s.playerMotion.action,'RELEASE');assert.equal(s.playerMotion.fired,false);cancelAllCharges(s);for(let n=0;n<60;n++)stepGame(s,zeroInput());assert.equal(s.owner,'player');assert.equal(s.lastPlayerPass,null);assert.equal(releasePass(s,zeroInput()),false);
});
test('ownership loss and reset clear pending Gather emissions',()=>{
 const s=atBottom();startCharge(s);releaseShot(s,zeroInput());s.owner='none';s.ball.x=5;stepGame(s,zeroInput());assert.equal(s.playerMotion.pending,null);for(let n=0;n<60;n++)stepGame(s,zeroInput());assert.equal(s.attempts,0);
 const p=atBottom();startPassCharge(p);releasePass(p,zeroInput());resetState(p);assert.deepEqual(p,createState());for(let n=0;n<60;n++)stepGame(p,zeroInput());assert.equal(p.lastPlayerPass,null);assert.equal(p.owner,'player');
});
test('input during a visual catch immediately starts Gather without losing a quick release',()=>{
 const s=createState();s.owner='none';s.phase='RESOLVING';s.ball={x:s.player.x,y:COURT.floorY+COURT.ballRadius,z:s.player.z+.4};s.releaseAge=1;
 assert.ok(tryAcquireBall(s,zeroInput()));assert.equal(s.playerMotion.action,'CATCH');const p={...s.ball};startPassCharge(s);assert.deepEqual(s.ball,p);releasePass(s,zeroInput());finish(s);assert.equal(s.owner,'none');assert.ok(s.lastPlayerPass);assert.equal(s.lastPlayerPass!.speed,PASS.minSpeed);
});
test('catch starts at the actual intercept rather than teleporting to a held socket',()=>{
 const s=createState();s.owner='none';s.phase='RESOLVING';s.player={x:0,y:0,z:0};s.ball={x:0,y:1.1,z:.6};const p={...s.ball};assert.ok(tryAcquireBall(s,zeroInput()));assert.deepEqual(s.ball,p);assert.equal(s.playerMotion.action,'CATCH');stepGame(s,zeroInput());assert.ok(Math.hypot(s.ball.x-p.x,s.ball.y-p.y,s.ball.z-p.z)<.03);for(let n=0;n<12;n++)stepGame(s,zeroInput());assert.equal(s.playerMotion.action,'DRIBBLE');assert.equal(s.owner,'player');
});
test('dummy catches, dribbles, gathers and returns once within the existing hold budget',()=>{
 const s=createState(),target=dummyCatchPosition(s),i={...zeroInput(),yaw:Math.atan2(target.x-s.player.x,target.z-s.player.z)};startPassCharge(s);s.passCharge=(12-PASS.minSpeed)/(PASS.maxSpeed-PASS.minSpeed)*PASS.maxCharge;releasePass(s,i);finish(s,i);
 for(let n=0;n<100&&s.owner!=='dummy';n++)stepGame(s,i);assert.equal(s.owner,'dummy');assert.equal(s.dummyMotion.action,'CATCH');const actions=new Set<string>();let ticks=0;
 while(s.owner==='dummy'&&ticks<100){actions.add(s.dummyMotion.action);stepGame(s,i);ticks++;assert.ok(s.ball.y>=COURT.floorY+COURT.ballRadius-1e-8);}
 assert.ok(actions.has('DRIBBLE'));assert.ok(actions.has('GATHER'));assert.ok(actions.has('RELEASE'));assert.equal(s.passFrom,'dummy');assert.equal(s.dummyMotion.pending,null);assert.ok(ticks/60<PRACTICE.dummyHoldSeconds+.08);for(let n=0;n<100&&String(s.owner)!=='player';n++)stepGame(s,i);assert.equal(s.owner,'player');assert.equal(s.playerMotion.action,'CATCH');
});
test('pose sockets stay finite and in arm reach through pitch and jump gather',()=>{
 const s=atBottom();s.player.y=.5;startPassCharge(s);releasePass(s,{...zeroInput(),pitch:-1.2});
 for(let n=0;n<40;n++){const i={...zeroInput(),pitch:n<20?-1.2:1.2};stepGame(s,i);const pose=characterPose(s,i,'player');for(const hand of [pose.rightHand,pose.leftHand])assert.ok(Number.isFinite(hand.x+hand.y+hand.z));assert.ok(s.ball.y>=COURT.floorY+COURT.ballRadius-1e-8);}
});
test('release pose point equals actual shot and pass emission position',()=>{
 for(const kind of ['shot','pass'] as const){const s=createState(),i={...zeroInput(),yaw:.4,pitch:.6};if(kind==='shot'){startCharge(s);s.charge=.7;releaseShot(s,i);}else{startPassCharge(s);s.passCharge=.4;releasePass(s,i);}const intent=s.playerMotion.pending!;finish(s,i);assert.deepEqual(s.ball,releaseSocket(s,intent,'player'));assert.deepEqual(s.ball,s.playerMotion.releasePoint);}
});

test('holding shot input keeps the raised set-shot form and bends grounded knees',()=>{
 const s=createState();startCharge(s);for(let n=0;n<100;n++)stepGame(s,zeroInput());const pose=characterPose(s,zeroInput(),'player');assert.equal(s.playerMotion.action,'SHOT_CHARGE');assert.equal(s.owner,'player');assert.equal(pose.shooting,1);assert.ok(s.ball.y>1.8);assert.ok(pose.rightHand.y<s.ball.y);assert.ok(pose.leftHand.x<s.ball.x);assert.ok(pose.legBend>0);assert.ok(pose.pelvisDrop>0);
});
test('jumping during held shot straightens both legs without discarding the shot stance',()=>{
 const s=createState();startCharge(s);for(let n=0;n<20;n++)stepGame(s,zeroInput());stepGame(s,{...zeroInput(),jump:true});const pose=characterPose(s,zeroInput(),'player');assert.ok(s.player.y>0);assert.equal(pose.shooting,1);assert.equal(pose.legBend,0);assert.equal(pose.pelvisDrop,0);assert.equal(s.playerMotion.action,'SHOT_CHARGE');s.player.y=.01;assert.equal(characterPose(s,zeroInput(),'player').legBend,0);
});
test('pass charge does not use the grounded shot crouch or shot hand layout',()=>{
 const s=createState();startPassCharge(s);for(let n=0;n<20;n++)stepGame(s,zeroInput());const pose=characterPose(s,zeroInput(),'player');assert.equal(pose.shooting,0);assert.equal(pose.legBend,0);assert.ok(s.ball.y<1.6);
});
test('shot form returns smoothly after cancel and resets all crouch state',()=>{
 const s=createState();startCharge(s);for(let n=0;n<20;n++)stepGame(s,zeroInput());cancelAllCharges(s);for(let n=0;n<30;n++)stepGame(s,zeroInput());const pose=characterPose(s,zeroInput(),'player');assert.equal(pose.shooting,0);assert.equal(pose.legBend,0);resetState(s);assert.deepEqual(s,createState());
});
