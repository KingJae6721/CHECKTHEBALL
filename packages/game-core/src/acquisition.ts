import { ACQUISITION, COURT, PRACTICE } from './court';
import { isBallPathClear } from './physics';
import type { Input, State, Vec } from './simulation';
export type AcquisitionReason = 'GROUND_PICKUP' | 'AIR_CATCH' | 'OUT_OF_BOUNDS' | 'RECOVERY_TIMEOUT';
export type AcquisitionBlock = 'NONE' | 'OWNED_BY_PLAYER' | 'OWNED_BY_DUMMY' | 'PASS_IN_FLIGHT' | 'RELEASE_LOCK' | 'UNSUPPORTED_SHOT' | 'AIRBALL_NOT_LEFT' | 'AIRBALL_RISING' | 'OUTSIDE_VOLUMES' | 'TOO_FAST' | 'OBSTRUCTED';
export type AcquisitionEvent = { reason: AcquisitionReason; tick: number; flightSeconds: number; looseSeconds: number; position: Vec };
export type AcquisitionVolume = { reason: 'GROUND_PICKUP'|'AIR_CATCH'; center: Vec; size: Vec; yaw: number; active: boolean; maxSpeed: number };
export function acquisitionVolumes(s: State,input: Input,position=s.player): AcquisitionVolume[] {
  const forwardBall=s.ballVelocity.x*Math.sin(input.yaw)+s.ballVelocity.z*Math.cos(input.yaw);
  const forwardPlayer=s.locomotion.velocity.x*Math.sin(input.yaw)+s.locomotion.velocity.z*Math.cos(input.yaw);
  const chase=s.networked&&position===s.player&&forwardPlayer>ACQUISITION.chase.minForwardSpeed&&forwardBall>0
    ?Math.min(ACQUISITION.chase.maxExtraForward,forwardBall*ACQUISITION.chase.displayDelaySeconds):0;
  const make=(reason: 'GROUND_PICKUP'|'AIR_CATCH',c: typeof ACQUISITION.air | typeof ACQUISITION.ground,base: number,active: boolean): AcquisitionVolume=>{
    const maxForward=c.maxForward+chase,z=(c.minForward+maxForward)/2;
    return {reason,center:{x:position.x+Math.sin(input.yaw)*z,y:base+(c.minHeight+c.maxHeight)/2,z:position.z+Math.cos(input.yaw)*z},size:{x:c.halfWidth*2,y:c.maxHeight-c.minHeight,z:maxForward-c.minForward},yaw:input.yaw,active,maxSpeed:c.maxSpeed};
  };
  return [make('GROUND_PICKUP',ACQUISITION.ground,COURT.floorY,position.y<=ACQUISITION.ground.maxPlayerHeight),make('AIR_CATCH',ACQUISITION.air,position.y,true)];
}
function local(p: Vec,v: AcquisitionVolume): Vec {
  const x=p.x-v.center.x,z=p.z-v.center.z;
  return {x:x*Math.cos(v.yaw)-z*Math.sin(v.yaw),y:p.y-v.center.y,z:x*Math.sin(v.yaw)+z*Math.cos(v.yaw)};
}
// Slab intersection finds the first crossing even if both endpoints are outside.
function entry(a: Vec,b: Vec,v: AcquisitionVolume,margin=0): number | null {
  const p=local(a,v),q=local(b,v);let lo=0,hi=1;
  for(const axis of ['x','y','z'] as const) {
    const half=v.size[axis]/2+margin,d=q[axis]-p[axis];
    if(Math.abs(d)<1e-12) {if(Math.abs(p[axis])>half)return null;continue;}
    const t1=(-half-p[axis])/d,t2=(half-p[axis])/d;
    lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return null;
  }
  return lo;
}
export function outsideAcquisitionVolumes(s: State,input: Input,p: Vec) {
  // Expand by the ball radius: touching a volume is not a complete exit.
  return acquisitionVolumes(s,input).every(v=>!v.active||entry(p,p,v,COURT.ballRadius)===null);
}
export function acquisitionEligibility(s: State): AcquisitionBlock {
  if(s.defense.pickupLock>0)return 'RELEASE_LOCK';
  if(s.owner!=='none')return s.owner==='player'?'OWNED_BY_PLAYER':'OWNED_BY_DUMMY';
  if(s.flightKind==='pass')return 'PASS_IN_FLIGHT';
  if(s.passFrom==='player'&&s.releaseAge<PRACTICE.releaseLock)return 'RELEASE_LOCK';
  if(s.flightKind==='shot') {
    if(s.passFrom!=='player'&&s.defense.blockedShotId!==s.shotId&&!(s.networked&&(s.shotTouched||s.resolved)))return 'UNSUPPORTED_SHOT';
    if(!s.shotTouched&&!s.resolved) {
      if(!s.shotExited)return 'AIRBALL_NOT_LEFT';
      if(s.ballVelocity.y>=0)return 'AIRBALL_RISING';
    }
  }
  return 'NONE';
}
export function evaluateAcquisition(s: State,input: Input,a=s.ball,b=s.ball,groundOnly=false): { reason: 'GROUND_PICKUP'|'AIR_CATCH'|null; block: AcquisitionBlock; point:Vec|null } {
  const eligibility=acquisitionEligibility(s);if(eligibility!=='NONE')return {reason:null,block:eligibility,point:null};
  return evaluateReach(s,input,a,b,groundOnly);
}
// Pass eligibility remains separate from shot/rebound eligibility. Both use the
// same feet/front reach and obstruction checks, instead of a small torso sphere.
export function passCatchPoint(s:State,input:Input,a:Vec,b:Vec,position=s.player):Vec|null {
  if(s.owner!=='none'||s.flightKind!=='pass'||s.defense.pickupLock>0)return null;
  return evaluateReach(s,input,a,b,false,position,true).point;
}
function evaluateReach(s:State,input:Input,a:Vec,b:Vec,groundOnly=false,position=s.player,pass=false): { reason: 'GROUND_PICKUP'|'AIR_CATCH'|null; block: AcquisitionBlock; point:Vec|null } {
  let block: AcquisitionBlock='OUTSIDE_VOLUMES';
  for(const v of acquisitionVolumes(s,input,position)) {
    if(!v.active||(groundOnly&&v.reason!=='GROUND_PICKUP'))continue;
    const t=entry(a,b,v,COURT.ballRadius);if(t===null)continue;
    if(Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z)>(pass?PRACTICE.catchSpeed:v.maxSpeed)){block='TOO_FAST';continue;}
    const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
    const anchor=v.reason==='GROUND_PICKUP'?{x:position.x,y:p.y,z:position.z}:{x:position.x+Math.sin(input.yaw)*ACQUISITION.air.anchorForward,y:position.y+ACQUISITION.air.anchorHeight,z:position.z+Math.cos(input.yaw)*ACQUISITION.air.anchorForward};
    if(!isBallPathClear(a,p)||!isBallPathClear(p,anchor)||!isBallPathClear(anchor,{x:position.x,y:anchor.y,z:position.z})){block='OBSTRUCTED';continue;}
    return {reason:v.reason,block:'NONE',point:p};
  }
  return {reason:null,block,point:null};
}
