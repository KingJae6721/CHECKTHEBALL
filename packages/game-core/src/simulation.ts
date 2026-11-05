import {createEventLog,emitGameEvent,impactEvent,type EventLog} from './gameEvents';
import {moveBody,fixedBodies} from './bodies';
import {createLocomotion,advanceLocomotion,type Locomotion} from './locomotion';
import {assistedShotVelocity} from './shot';
import {createDefense, advanceDefense, finishDefense, trySteal, tryBlock, type DefenseState} from './defense';
import {createPractice, stepPractice, configurePractice, type PracticeState} from './practice';
import { createMotion, cancelCrossover, beginGather, beginCatch, cancelMotion, queueRelease, markReleased, advanceControlledMotion, controlledPosition, updateUnownedMotion, dribblePoint, releaseSocket, type BallMotion, type ReleaseIntent } from './motion';
import { playerPassLaunch, passDirection, type PlayerPassLaunch } from './pass';
import { evaluateAcquisition, outsideAcquisitionVolumes, acquisitionEligibility, type AcquisitionEvent, type AcquisitionBlock } from './acquisition';
import { COURT, PHYSICS, DUMMY, PRACTICE, PASS, PLAYER, DRIBBLE, MOVEMENT } from './court';
import { advanceBall, isBallPathClear } from './physics';
export type Vec = { x: number; y: number; z: number };
export const CFG = { dt: 1 / 60, gravity: 9.81, speed: MOVEMENT.walk, sprint: MOVEMENT.run, jump: 4.3, eye: PLAYER.eyeHeight, rim: COURT.rim, rimRadius: COURT.rimRadius, ballRadius: COURT.ballRadius, idealCharge: .7, maxCharge: 1.2, arc: 6.75 };
export type Owner = 'player' | 'dummy' | 'none';
export type FlightKind = 'shot' | 'pass' | null;
export type Phase = 'HELD' | 'CHARGING' | 'PASS_CHARGING' | 'IN_FLIGHT' | 'RESOLVING';
export type Input = { x: number; z: number; sprint: boolean; jump: boolean; yaw: number; pitch: number };
export type State = { events:EventLog; networked?:boolean; locomotion:Locomotion; defense:DefenseState; practice:PracticeState; playerMotion:BallMotion; dummyMotion:BallMotion; passCharge: number; lastPlayerPass: PlayerPassLaunch | null; shotTouched: boolean; shotExited: boolean; acquisitionEvent: AcquisitionEvent | null; acquisitionBlock: AcquisitionBlock; owner: Owner; flightKind: FlightKind; passFrom: Owner; releaseAge: number; looseAge: number; dummyHold: number; player: Vec; vy: number; ball: Vec; ballVelocity: Vec; phase: Phase; charge: number; score: number; attempts: number; made: number; shotId: number; resolved: boolean; shotPoints: number; flight: number; message: string; lastTiming: number | null; tick: number };
export const zeroInput = (): Input => ({ x: 0, z: 0, sprint: false, jump: false, yaw: 0, pitch: 0 });
export function createState(): State { return { events:createEventLog(),locomotion:createLocomotion(),defense:createDefense(),practice:createPractice(),playerMotion:createMotion('DRIBBLE'), dummyMotion:createMotion(), passCharge: 0, lastPlayerPass: null, shotTouched: false, shotExited: false, acquisitionEvent: null, acquisitionBlock: 'OWNED_BY_PLAYER', owner: 'player', flightKind: null, passFrom: 'none', releaseAge: 0, looseAge: 0, dummyHold: 0, player: { x: 0, y: 0, z: -1.5 }, vy: 0, ball: { x: DRIBBLE.side, y: DRIBBLE.idleHeight, z: -1.5+DRIBBLE.forward }, ballVelocity: { x: 0, y: 0, z: 0 }, phase: 'HELD', charge: 0, score: 0, attempts: 0, made: 0, shotId: 0, resolved: false, shotPoints: 1, flight: 0, message: '라인에 서서 첫 슛을 던져보세요', lastTiming: null, tick: 0 }; }
export function startCharge(s: State) { if (s.owner !== 'player' || (s.phase !== 'HELD'&&s.phase!=='PASS_CHARGING') || !!s.defense.kind || !!s.playerMotion.pending) return false; s.phase = 'CHARGING'; s.charge = 0; s.passCharge=0; beginGather(s.playerMotion,s.ball); return true; }
export function cancelCharge(s: State) { if (s.phase === 'CHARGING') { s.phase = s.owner==='none'?'RESOLVING':'HELD'; s.charge = 0; cancelMotion(s.playerMotion,s.ball,s.owner==='player'); } }
export function pointsAt(p: Vec) { return Math.hypot(p.x - CFG.rim.x, p.z - CFG.rim.z) > CFG.arc ? 2 : 1; }
export function rimCrossing(a: Vec, b: Vec) { if (a.y <= CFG.rim.y || b.y > CFG.rim.y || b.y >= a.y) return false; const t = (CFG.rim.y - a.y) / (b.y - a.y); const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t; return Math.hypot(x - CFG.rim.x, z - CFG.rim.z) <= CFG.rimRadius * Math.cos(Math.PI / COURT.rimSegments) - COURT.rimTubeRadius - CFG.ballRadius; }
function fireShot(s: State, input: Input, charge:number) {
  s.charge=charge;
  if (s.owner !== 'player' || s.phase !== 'CHARGING') { if(s.owner !== 'player') cancelCharge(s); return false; }
  s.ball=releaseSocket(s,{kind:'shot',input,charge},'player');
  s.ballVelocity=assistedShotVelocity(s.ball,input.yaw,input.pitch,charge);
  const error = Math.max(-1,Math.min(1,(charge-CFG.idealCharge)/.5));
  s.shotTouched=false; s.shotExited=false; s.acquisitionBlock='RELEASE_LOCK';
  s.owner = 'none'; s.flightKind = 'shot'; s.passFrom = 'player'; s.releaseAge = 0; s.looseAge = 0;
  s.phase = 'IN_FLIGHT'; s.flight = 0; s.shotId++; s.attempts++; s.resolved = false; s.shotPoints = pointsAt(s.player); s.lastTiming = Math.max(0, 1 - Math.abs(error)); s.message = Math.abs(error) < .1 ? 'PERFECT RELEASE' : error < 0 ? 'EARLY RELEASE' : 'LATE RELEASE';
  return true;
}
export function resolve(s: State, made: boolean,actorId='player') { if (s.resolved) return; s.resolved = true; if (made) { emitGameEvent(s,'net',COURT.rim,1,actorId,`shot:${s.shotId}`); s.score += s.shotPoints; s.made++; s.message = `SWISH · +${s.shotPoints}`; } else s.message = '아쉽네요. 조준과 릴리스를 조절해보세요'; makeLoose(s); }
export function stepGame(s: State, input: Input, dt = CFG.dt) {
  s.tick++;
  s.releaseAge += dt;
  s.acquisitionBlock=acquisitionEligibility(s);
  if(s.owner!=='player')updateUnownedMotion(s.playerMotion,dt);
  if(s.owner!=='dummy')updateUnownedMotion(s.dummyMotion,dt);
  if(s.owner !== 'player' && (s.phase === 'CHARGING'||s.phase==='PASS_CHARGING')) { cancelAllCharges(s); if(s.owner === 'none') s.phase='RESOLVING'; }
  const x = Number.isFinite(input.x) ? Math.max(-1, Math.min(1, input.x)) : 0;
  const z = Number.isFinite(input.z) ? Math.max(-1, Math.min(1, input.z)) : 0;
  const length = Math.max(1, Math.hypot(x, z));
  const speed = (input.sprint ? CFG.sprint : CFG.speed) * (s.phase === 'CHARGING' ? MOVEMENT.chargeScale : 1) * (s.player.y > 0 ? MOVEMENT.airScale : 1);
  const movement=moveBody(s.player,{x:(x*Math.cos(input.yaw)+z*Math.sin(input.yaw))/length*speed*dt,z:(-x*Math.sin(input.yaw)+z*Math.cos(input.yaw))/length*speed*dt},fixedBodies(s.practice.mode));
  const actual=movement.recovered?{x:0,z:0}:{x:movement.position.x-s.player.x,z:movement.position.z-s.player.z};
  s.player.x=movement.position.x;s.player.z=movement.position.z;s.locomotion.collision=movement;
  if (input.jump && s.player.y === 0) s.vy = CFG.jump;
  s.player.y += s.vy * dt - .5 * CFG.gravity * dt * dt; s.vy -= CFG.gravity * dt;
  if (s.player.y <= 0) { s.player.y = 0; s.vy = 0; }
  advanceLocomotion(s.locomotion,actual.x,actual.z,dt,input.yaw,s.player.y===0);
  s.playerMotion.locomotion=s.player.y===0&&s.locomotion.speed>.015?'MOVE':'IDLE';
  advanceDefense(s,input,dt);
  stepPractice(s,input,dt);
  if (s.phase === 'CHARGING'&&!s.playerMotion.pending) s.charge = Math.min(CFG.maxCharge, s.charge + dt);
  if(s.phase==='PASS_CHARGING'&&!s.playerMotion.pending)s.passCharge=Math.min(PASS.maxCharge,s.passCharge+dt);
  if(s.owner === 'dummy') {
    if(s.practice.mode==='PASS')s.dummyHold-=dt;
    if(s.practice.mode==='PASS'&&s.dummyHold<=DRIBBLE.gatherSeconds+DRIBBLE.releaseSeconds && !s.dummyMotion.pending) {
      beginGather(s.dummyMotion,s.ball);queueRelease(s.dummyMotion,{kind:'return',input:zeroInput(),charge:0},s.ball);
    }
    if(advanceControlledMotion(s,input,'dummy',dt)) {returnPass(s);markReleased(s.dummyMotion,s.ball,'return');}
    trySteal(s,input);finishDefense(s);
    return;
  }
  if (s.owner === 'player') {
    if(advanceControlledMotion(s,input,'player',dt)) firePendingPlayer(s);

  } else {
    s.flight += dt;
    advanceBall(s, dt, (prev, next, floor, collided,t0,t1) => {
      if(!collided&&tryBlock(s,prev,next,t0,t1)){emitGameEvent(s,'blockHit',s.ball,Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z),'player');return;}
      if(s.flightKind === 'shot') {
        if(floor||collided)s.shotTouched=true;
        if(outsideAcquisitionVolumes(s,input,prev)||outsideAcquisitionVolumes(s,input,next))s.shotExited=true;
      }
      if(s.flightKind === 'shot' && !s.resolved) {
        if(rimCrossing(prev,next)) resolve(s,true);
        else if(floor) resolve(s,false);
      } else if(s.flightKind === 'pass') {
        if(floor) makeLoose(s);
        // Collision correction is not a catch path: do not catch through a solid.
        else if(!collided && catchPass(s,prev,next)) return false;
      }
      // Never treat a penetration-correction displacement as a swept catch path.
      if(s.flightKind!=='pass' && tryAcquireBall(s,input,collided?next:prev,next))return false;
    }, CFG.gravity,(kind,p,strength)=>impactEvent(s,kind,p,strength));
    if(s.owner !== 'none') { placeOwnedBall(s,input); return; }
    if(s.flightKind === 'shot' && s.flight>=PHYSICS.maxFlight && !s.resolved) resolve(s,false);
    if(s.flightKind === 'pass' && s.flight>=PRACTICE.passFlightSeconds) makeLoose(s);
    if(s.flightKind === null)s.looseAge += dt;
    if(tryAcquireBall(s,input)) {placeOwnedBall(s,input);return;}
    const out = Math.abs(s.ball.x)>PHYSICS.outDistance || Math.abs(s.ball.z)>PHYSICS.outDistance;
    if(out || s.looseAge>=PRACTICE.recoverySeconds) {
      if(s.flightKind === 'shot' && !s.resolved) resolve(s,false);
      recordAcquisition(s,out?'OUT_OF_BOUNDS':'RECOVERY_TIMEOUT');
      giveBall(s,'player'); s.message='공을 안전하게 회수했습니다'; placeOwnedBall(s,input);
    }
  }
  finishDefense(s);
}

export function makeLoose(s: State) { s.owner='none'; s.flightKind=null; s.phase='RESOLVING'; s.charge=0; s.looseAge=0; s.dummyHold=0; }
export function giveBall(s: State, owner: 'player'|'dummy',point?:Vec) {
  cancelAllCharges(s);cancelMotion(s.dummyMotion,s.ball,false); s.owner=owner; s.flightKind=null; s.phase='HELD'; s.charge=0;
  s.ballVelocity={x:0,y:0,z:0}; s.looseAge=0; s.flight=0;
  s.dummyHold=owner==='dummy'?PRACTICE.dummyHoldSeconds:0;
  s.playerMotion.pending=null;s.dummyMotion.pending=null;
  const motion=owner==='player'?s.playerMotion:s.dummyMotion,hand=motion.currentDribbleHand,yaw=owner==='dummy'?dummyYaw(s):motion.dribbleYaw;Object.assign(motion,createMotion(point?'CATCH':'DRIBBLE'));motion.currentDribbleHand=hand;motion.dribbleYaw=yaw;
  if(point){s.ball={...point};beginCatch(motion,point);}
}
export function dummyYaw(s: State) { return Math.atan2(s.player.x-DUMMY.position.x,s.player.z-DUMMY.position.z); }
export function dummyCatchPosition(s: State): Vec {
  const yaw=dummyYaw(s);
  return {x:DUMMY.position.x+Math.sin(yaw)*DUMMY.catchForward,y:DUMMY.position.y+DUMMY.catchY,z:DUMMY.position.z+Math.cos(yaw)*DUMMY.catchForward};
}
export function playerCatchPosition(s: State): Vec { return {x:s.player.x,y:s.player.y+PRACTICE.playerCatchY,z:s.player.z}; }
export function isAimingAtDummy(s: State,input: Input) {
  // Display hint only. This never changes the outgoing direction or velocity.
  const target=dummyCatchPosition(s), dx=target.x-s.player.x,dy=target.y-(s.player.y+CFG.eye),dz=target.z-s.player.z,distance=Math.hypot(dx,dy,dz);
  const direction=passDirection(input.yaw,input.pitch);
  return distance>0&&distance<=PRACTICE.targetHintRange&&(dx*direction.x+dy*direction.y+dz*direction.z)/distance>=Math.cos(PRACTICE.aimAngle);
}

function placeOwnedBall(s:State,input:Input) {if(s.owner==='player'||s.owner==='dummy')s.ball=controlledPosition(s,input,s.owner);}

function recordAcquisition(s: State,reason: AcquisitionEvent['reason']) {
  s.acquisitionEvent={reason,tick:s.tick,flightSeconds:s.flight,looseSeconds:s.looseAge,position:{...s.ball}};
}
export function tryAcquireBall(s: State,input: Input,a=s.ball,b=s.ball,groundOnly=false) {
  const result=evaluateAcquisition(s,input,a,b,groundOnly);s.acquisitionBlock=result.block;
  if(!result.reason)return false;
  if(s.flightKind==='shot'&&!s.resolved)resolve(s,false);
  recordAcquisition(s,result.reason);giveBall(s,'player',result.point??s.ball);
  s.message=result.reason==='GROUND_PICKUP'?'공 회수 · 우클로 패스하세요':'공중 캐치 · 우클로 패스하세요';return true;
}
// Kept for callers that explicitly ask for floor pickup only.
export function tryPickup(s: State) {return tryAcquireBall(s,zeroInput(),s.ball,s.ball,true);}

function beginPass(s: State,from: 'player'|'dummy',start: Vec,velocity: Vec) {
  cancelAllCharges(s);s.owner='none';s.flightKind='pass';s.phase='IN_FLIGHT';s.ball={...start};s.ballVelocity={...velocity};
  s.passFrom=from;s.releaseAge=0;s.looseAge=0;s.flight=0;s.dummyHold=0;s.charge=0;
}
export function startPassCharge(s: State) {
  if(s.owner!=='player'||(s.phase!=='HELD'&&s.phase!=='CHARGING')||!!s.defense.kind||!!s.playerMotion.pending)return false;
  s.phase='PASS_CHARGING';s.passCharge=0;s.charge=0;beginGather(s.playerMotion,s.ball);s.message='패스 충전 · 우클을 놓으면 발사';return true;
}
export function cancelPassCharge(s: State) {
  if(s.phase==='PASS_CHARGING') {s.phase=s.owner==='none'?'RESOLVING':'HELD';s.message='패스 충전 취소';cancelMotion(s.playerMotion,s.ball,s.owner==='player');}
  s.passCharge=0;
}
export function cancelAllCharges(s: State) {cancelCrossover(s.playerMotion,s.ball,s.owner==='player');cancelCharge(s);cancelPassCharge(s);}
function firePass(s: State,input: Input,charge:number) {
  s.passCharge=charge;
  if(s.owner!=='player'||s.phase!=='PASS_CHARGING') {if(s.owner!=='player')cancelPassCharge(s);return false;}
  const launch=playerPassLaunch(s.player,input,s.passCharge);
  if(!isBallPathClear(launch.origin,launch.position)) {cancelPassCharge(s);s.message='장애물에서 떨어져 패스하세요';return false;}
  s.lastPlayerPass=launch;
  beginPass(s,'player',launch.position,launch.velocity);
  s.message='패스';return true;
}

function returnPass(s: State) {
  const start=dummyCatchPosition(s),target=playerCatchPosition(s),dx=target.x-start.x,dz=target.z-start.z;
  const t=Math.max(.18,Math.hypot(dx,dz)/PRACTICE.dummyReturnSpeed);
  beginPass(s,'dummy',start,{x:dx/t,y:(target.y-start.y)/t+.5*CFG.gravity*t,z:dz/t});
  s.message='반환 패스 · 공을 받아보세요';
}
// Segment-vs-spherical catch volume; no endpoint-only tunnelling.
export function catchPass(s: State,a: Vec,b: Vec) {
  if(s.defense.pickupLock>0||s.owner!=='none'||s.flightKind!=='pass'||Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z)>PRACTICE.catchSpeed) return false;
  for(const owner of ['dummy','player'] as const) {
    if(s.passFrom===owner&&s.releaseAge<PRACTICE.releaseLock) continue;
    // The stationary dummy only receives a player pass, never hoovers up loose balls.
    if(owner==='dummy'&&s.passFrom!=='player') continue;
    const target=owner==='dummy'?dummyCatchPosition(s):playerCatchPosition(s);
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,den=dx*dx+dy*dy+dz*dz;
    const t=den>0?Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.y-a.y)*dy+(target.z-a.z)*dz)/den)):0;
    const p={x:a.x+dx*t,y:a.y+dy*t,z:a.z+dz*t};
    if(Math.abs(p.y-target.y)>PRACTICE.catchHeightTolerance || Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)>PRACTICE.catchRadius) continue;
    if(!isBallPathClear(p,target)) continue;
    giveBall(s,owner,p);s.message=owner==='dummy'?'더미 캐치 · 반환 준비':'캐치 · 우클로 다시 패스';return true;
  }
  return false;
}

export function resetState(s: State) { const mode=s.practice.mode;Object.assign(s,createState());configurePractice(s,mode); }

function requestPlayerRelease(s:State,input:Input,kind:'shot'|'pass') {
  if(s.owner!=='player'||s.phase!==(kind==='shot'?'CHARGING':'PASS_CHARGING')||s.playerMotion.pending)return false;
  const intent:ReleaseIntent={kind,input:{...input},charge:kind==='shot'?s.charge:s.passCharge};
  const origin={x:s.player.x,y:s.player.y+CFG.eye,z:s.player.z};
  if(!isBallPathClear(origin,releaseSocket(s,intent,'player'))) {cancelAllCharges(s);s.message='장애물에서 떨어져 발사하세요';return false;}
  return queueRelease(s.playerMotion,intent,s.ball);
}
export function releaseShot(s:State,input:Input) {
  if(s.owner!=='player'){cancelCharge(s);return false;}return requestPlayerRelease(s,input,'shot');
}
export function releasePass(s:State,input:Input) {
  if(s.owner!=='player'){cancelPassCharge(s);return false;}return requestPlayerRelease(s,input,'pass');
}
export function firePendingPlayer(s:State) {
  const intent=s.playerMotion.pending;if(!intent||s.owner!=='player'){cancelAllCharges(s);return;}
  const origin={x:s.player.x,y:s.player.y+CFG.eye,z:s.player.z};
  if(!isBallPathClear(origin,releaseSocket(s,intent,'player'))) {cancelAllCharges(s);s.message='장애물에서 떨어져 발사하세요';return;}
  const fired=intent.kind==='shot'?fireShot(s,intent.input,intent.charge):firePass(s,intent.input,intent.charge);
  if(fired)markReleased(s.playerMotion,s.ball,intent.kind);
}
