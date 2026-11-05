import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,zeroInput,stepGame,giveBall,resetState,startCharge,releaseShot,CFG} from './simulation.ts';
import {startDefense,advanceDefense,finishDefense,trySteal,tryBlock,defenseHand,defenseStage} from './defense.ts';
import {selectPractice} from './practice.ts';
import {createButtons} from './buttons.ts';
import {DEFENSE,COURT,DUMMY} from './court.ts';
import {characterPose,beginGather,queueRelease} from './motion.ts';
import {tryAcquireBall} from './simulation.ts';
const input=zeroInput;
function defender(){const s=createState();selectPractice(s,'STEAL');s.player={x:0,y:0,z:0};s.ball={x:.12,y:1.12,z:.62};return s;}
function steal(){const s=defender();startDefense(s,input(),'STEAL');advanceDefense(s,input(),.12);return s;}
function block(){const s=defender();s.owner='none';s.flightKind='shot';s.passFrom='dummy';s.phase='IN_FLIGHT';startDefense(s,input(),'BLOCK');s.defense.previousElapsed=.10;s.defense.elapsed=.12;s.defense.hand=defenseHand(s.player,0,'BLOCK',.12);s.defense.previousHand={...s.defense.hand};s.ballVelocity={x:0,y:0,z:-22};return s;}
test('steal only active, in front, within reach and from the other owner',()=>{
 const s=defender();startDefense(s,input(),'STEAL');assert.equal(trySteal(s,input()),false);advanceDefense(s,input(),.12);assert.ok(trySteal(s,input()));assert.equal(s.owner,'player');assert.equal(s.playerMotion.action,'CATCH');assert.equal(trySteal(s,input()),false);
 for(const kind of ['far','behind','none','self'] as const){const q=steal();if(kind==='far')q.ball.z=4;if(kind==='behind')q.ball.z=-.5;if(kind==='none')q.owner='none';if(kind==='self')q.owner='player';assert.equal(trySteal(q,input()),false,kind);}
});
test('steal ends naturally on miss and enforces cooldown and mutual exclusion',()=>{
 const s=steal();assert.equal(startDefense(s,input(),'BLOCK'),false);s.defense.elapsed=.6;finishDefense(s);assert.equal(s.defense.kind,null);assert.ok(s.defense.cooldown>0);assert.equal(startDefense(s,input(),'STEAL'),false);
});
test('steal cannot reach through the backboard',()=>{
 const s=steal(),b=COURT.board.center;s.player={x:b.x,y:b.y-1.12,z:b.z-.36};s.defense.hand={x:b.x,y:b.y,z:b.z+.08};s.ball={...s.defense.hand};assert.equal(trySteal(s,input()),false);assert.equal(s.defense.reason,'OBSTRUCTED');
});
test('successful steal atomically cancels dummy Gather and queued return',()=>{
 const s=steal();beginGather(s.dummyMotion,s.ball);queueRelease(s.dummyMotion,{kind:'return',input:input(),charge:0},s.ball);s.dummyHold=.01;assert.ok(trySteal(s,input()));assert.equal(s.dummyMotion.pending,null);assert.equal(s.dummyMotion.action,'IDLE');for(let n=0;n<90;n++)stepGame(s,input());assert.equal(s.owner,'player');assert.equal(s.attempts,0);
});
test('airborne steals are rejected',()=>{const s=defender();s.player.y=.1;assert.equal(startDefense(s,input(),'STEAL'),false);});
test('block relative sweep hits a fast ball with both endpoints outside and only once',()=>{
 const s=block(),h=s.defense.hand,a={...h,z:h.z+1},b={...h,z:h.z-1};s.ball={...b};assert.ok(tryBlock(s,a,b));assert.equal(s.owner,'none');assert.equal(s.flightKind,'shot');assert.ok(s.ballVelocity.z>0);const v={...s.ballVelocity};assert.equal(tryBlock(s,a,b),false);assert.deepEqual(s.ballVelocity,v);assert.ok(Math.hypot(v.x,v.y,v.z)<=DEFENSE.block.maxSpeed);
});
test('moving hand versus stationary ball is swept too',()=>{
 const s=block();s.defense.previousHand={x:-1,y:1.9,z:.36};s.defense.hand={x:1,y:1.9,z:.36};const p={x:0,y:1.9,z:.36};s.ball={...p};assert.ok(tryBlock(s,p,p));
});
test('block rejects held/loose balls and inactive windows',()=>{
 for(const kind of ['held','loose','early','late'] as const){const s=block(),h=s.defense.hand;if(kind==='held')s.owner='dummy';if(kind==='loose')s.flightKind=null;if(kind==='early'){s.defense.elapsed=.03;s.defense.previousElapsed=.01;}if(kind==='late'){s.defense.elapsed=DEFENSE.block.prepare+DEFENSE.block.active+.1;s.defense.previousElapsed=DEFENSE.block.prepare+DEFENSE.block.active+.01;}assert.equal(tryBlock(s,{...h,z:h.z+1},{...h,z:h.z-1}),false,kind);}
});
test('block cannot sweep or reach through board geometry',()=>{
 const s=block(),b=COURT.board.center;s.player={x:b.x,y:b.y-1.45,z:b.z-.4};s.defense.hand={...b,z:b.z+.25};s.defense.previousHand={...s.defense.hand};assert.equal(tryBlock(s,{...b,z:b.z+.8},{...b,z:b.z-.8}),false);assert.equal(s.defense.reason,'OBSTRUCTED');
});
test('air block adds no upward velocity and cannot create another window before landing',()=>{
 const s=defender();s.player.y=.6;s.vy=-.5;assert.ok(startDefense(s,input(),'BLOCK'));assert.equal(s.vy,-.5);s.defense.elapsed=1;finishDefense(s);s.defense.cooldown=0;assert.equal(startDefense(s,input(),'BLOCK'),false);s.player.y=0;s.vy=0;advanceDefense(s,input(),.01);assert.ok(startDefense(s,input(),'BLOCK'));assert.equal(s.vy,0);advanceDefense(s,input(),DEFENSE.block.prepare);assert.equal(s.vy,CFG.jump);
});
test('ground block uses existing jump integration and lands without extra boosts',()=>{
 const s=defender();assert.ok(startDefense(s,input(),'BLOCK'));let peak=0;for(let n=0;n<90;n++){stepGame(s,input());peak=Math.max(peak,s.player.y);if(n<30)assert.equal(startDefense(s,input(),'BLOCK'),false);}assert.ok(peak>.8&&peak<1);assert.equal(s.player.y,0);
});
test('blocked ball retains scoring eligibility, physics and short pickup lock',()=>{
 const s=block(),h=s.defense.hand;assert.ok(tryBlock(s,{...h,z:h.z+1},{...h,z:h.z-1}));assert.equal(s.resolved,false);assert.equal(tryAcquireBall(s,input()),false);s.player={x:-5,y:0,z:-5};s.ball={x:COURT.rim.x,y:COURT.rim.y+.03,z:COURT.rim.z};s.ballVelocity={x:0,y:-3,z:0};stepGame(s,input());assert.equal(s.made,1);const score=s.score;for(let n=0;n<90;n++)stepGame(s,input());assert.equal(s.score,score);assert.ok(s.ball.y>=COURT.floorY+COURT.ballRadius-1e-8);
});
test('block never revokes an already confirmed score',()=>{
 const s=block();s.resolved=true;s.score=2;s.made=1;const h=s.defense.hand;assert.ok(tryBlock(s,{...h,z:h.z+1},{...h,z:h.z-1}));assert.equal(s.score,2);assert.equal(s.made,1);
});
test('button hold, ownership change and mouseup cannot become an attack',()=>{
 const s=steal(),buttons=createButtons();s.defense.kind=null;assert.ok(buttons.down(s,input(),0));assert.equal(buttons.down(s,input(),0),false);giveBall(s,'player');assert.equal(buttons.up(s,input(),0),false);assert.equal(s.playerMotion.pending,null);assert.equal(s.phase,'HELD');s.defense.kind=null;assert.ok(buttons.down(s,input(),0));assert.ok(buttons.up(s,input(),0));
});
test('blur-style button clear removes defense and pending attack intent',()=>{
 const s=defender(),b=createButtons();b.down(s,input(),2);b.clear(s);assert.equal(s.defense.kind,null);assert.equal(b.up(s,input(),2),false);giveBall(s,'player');b.down(s,input(),0);b.clear(s);assert.equal(b.up(s,input(),0),false);assert.equal(s.playerMotion.pending,null);
});
test('mode changes and R reset all world reservations and preserve selected scenario',()=>{
 const s=defender();startDefense(s,input(),'BLOCK');for(const mode of ['PASS','STEAL','BLOCK','ATTACK'] as const){selectPractice(s,mode);assert.equal(s.defense.kind,null);assert.equal(s.playerMotion.pending,null);assert.equal(s.dummyMotion.pending,null);assert.equal(s.practice.fired,false);assert.equal(s.practice.elapsed,0);assert.equal(s.owner,mode==='STEAL'||mode==='BLOCK'?'dummy':'player');stepGame(s,input());resetState(s);assert.equal(s.practice.mode,mode);assert.equal(s.practice.elapsed,0);}
});
test('steal practice never schedules a return and block practice fires one deterministic shot',()=>{
 const a=createState();selectPractice(a,'STEAL');for(let n=0;n<240;n++)stepGame(a,input());assert.equal(a.owner,'dummy');assert.equal(a.dummyMotion.pending,null);
 function run(){const s=createState();selectPractice(s,'BLOCK');for(let n=0;n<151;n++)stepGame(s,input());return s;}
 const b=run(),c=run();assert.deepEqual(b,c);assert.equal(b.practice.fired,true);assert.equal(b.owner,'none');assert.equal(b.passFrom,'dummy');assert.equal(b.flightKind,'shot');assert.equal(b.shotId,1);assert.equal(b.attempts,1);
});
test('defensive stance blends out on sprint and both rigs share bounded posture',()=>{
 const s=defender();for(let n=0;n<60;n++)stepGame(s,{...input(),x:1});const p=characterPose(s,{...input(),x:1},'player'),dummy=characterPose(s,input(),'dummy');assert.ok(p.legBend>.15);assert.ok(Number.isFinite(p.step));assert.ok(dummy.rightHand.y>0);for(let n=0;n<60;n++)stepGame(s,{...input(),z:1,sprint:true});assert.ok(characterPose(s,{...input(),z:1,sprint:true},'player').legBend<.001);for(let n=0;n<60;n++)stepGame(s,{...input(),sprint:true});assert.ok(characterPose(s,{...input(),sprint:true},'player').legBend>.15);
});
test('physics substeps block the maximum supported speed before acquisition',()=>{
 const s=block(),h=s.defense.hand;s.defense.jumpQueued=false;s.ball={...h,z:h.z+.6};s.ballVelocity={x:0,y:0,z:-80};stepGame(s,input());assert.equal(s.defense.result,'BLOCK SUCCESS');assert.equal(s.owner,'none');assert.ok(s.ballVelocity.z>0);assert.ok(Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z)<=DEFENSE.block.maxSpeed+.2);
});
test('cancelling block preparation removes its delayed jump',()=>{
 const s=defender(),b=createButtons();b.down(s,input(),2);assert.equal(s.vy,0);assert.equal(s.defense.jumpQueued,true);b.clear(s);for(let n=0;n<60;n++)stepGame(s,input());assert.equal(s.player.y,0);assert.equal(s.defense.jumpQueued,false);
});
test('core defensive hand matches visible target at both active heights',()=>{
 for(const kind of ['STEAL','BLOCK'] as const){const s=defender();startDefense(s,input(),kind);s.defense.jumpQueued=false;advanceDefense(s,input(),.12);const p=characterPose(s,input(),'player'),h=defenseHand(s.player,0,kind,.12);assert.ok(Math.hypot(p.rightHand.x-h.x,p.rightHand.y-h.y,p.rightHand.z-h.z)<.025);}
});
test('ground block retains its air-use guard through preparation and recovery',()=>{
 const s=defender();startDefense(s,input(),'BLOCK');for(let n=0;n<Math.ceil((DEFENSE.block.prepare+DEFENSE.block.active+DEFENSE.block.recover)/CFG.dt)+1;n++)stepGame(s,input());assert.ok(s.player.y>0);assert.equal(s.defense.kind,null);s.defense.cooldown=0;assert.equal(startDefense(s,input(),'BLOCK'),false);assert.equal(s.defense.reason,'AIR_USED');
});
test('defense preparation and recovery join the resting hand without snapping',()=>{
 for(const kind of ['STEAL','BLOCK'] as const){const c=kind==='STEAL'?DEFENSE.steal:DEFENSE.block,base={x:0,y:0,z:0},a=defenseHand(base,0,kind,0),b=defenseHand(base,0,kind,c.prepare+c.active+c.recover);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-8);assert.equal(a.x,DEFENSE.handSide);assert.equal(a.y,DEFENSE.handHeight+COURT.floorY);assert.equal(a.z,DEFENSE.handForward);}
});
