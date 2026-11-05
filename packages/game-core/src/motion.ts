import {defenseHand} from './defense';
import { CHARACTER, COURT, DRIBBLE, DUMMY, PLAYER, SHOT_FORM, CROSSOVER, DEFENSE, GAIT } from './court';
import { playerPassLaunch, passDirection } from './pass';
import type { Input, State, Vec } from './simulation';
export type BallAction = 'IDLE'|'DRIBBLE'|'CROSSOVER'|'GATHER'|'SHOT_CHARGE'|'PASS_CHARGE'|'RELEASE'|'CATCH';
export type ReleaseIntent = { kind:'shot'|'pass'|'return'; input:Input; charge:number };
export type DribbleHand='right'|'left';
export type CrossoverMotion={stage:'WAIT_HAND_RETURN'|'ACTIVE';elapsed:number;from:DribbleHand;to:DribbleHand;queued:boolean;returnRate:number};
export type BallMotion = { currentDribbleHand:DribbleHand; crossover:CrossoverMotion|null; dribbleYaw:number; action:BallAction; elapsed:number; clock:number; phase:number; rate:number; height:number; locomotion:'IDLE'|'MOVE'; from:Vec; releasePoint:Vec; pending:ReleaseIntent|null; fired:boolean; lastKind:ReleaseIntent['kind']|null };
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
const mix=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
export function createMotion(action:BallAction='IDLE'):BallMotion {return {currentDribbleHand:'right',crossover:null,dribbleYaw:0,action,elapsed:0,clock:0,phase:0,rate:1/DRIBBLE.idlePeriod,height:DRIBBLE.idleHeight,locomotion:'IDLE',from:{x:0,y:0,z:0},releasePoint:{x:0,y:0,z:0},pending:null,fired:false,lastKind:null};}
export function actorYaw(s:State,input:Input,owner:'player'|'dummy') {return owner==='player'?input.yaw:s.practice.mode==='BLOCK'?Math.atan2(COURT.rim.x-DUMMY.position.x,COURT.rim.z-DUMMY.position.z):Math.atan2(s.player.x-DUMMY.position.x,s.player.z-DUMMY.position.z);}
export function actorPosition(s:State,owner:'player'|'dummy'):Vec {return owner==='player'?s.player:DUMMY.position;}
function localPoint(base:Vec,yaw:number,x:number,y:number,z:number):Vec{return {x:base.x+Math.cos(yaw)*x+Math.sin(yaw)*z,y:base.y+y,z:base.z-Math.sin(yaw)*x+Math.cos(yaw)*z};}
export function dribblePoint(base:Vec,yaw:number,phase:number,height=DRIBBLE.idleHeight,hand:DribbleHand='right'):Vec {
  const p=((phase%1)+1)%1,floor=COURT.floorY+COURT.ballRadius,top=Math.max(floor,base.y+height);
  // Accelerated descent and ballistic-style rise meet in a sharp floor bounce.
  const fraction=p<DRIBBLE.pushFraction?1-(p/DRIBBLE.pushFraction)**2:(()=>{const u=(p-DRIBBLE.pushFraction)/(1-DRIBBLE.pushFraction);return 2*u-u*u;})();
  const point=localPoint(base,yaw,(hand==='right'?1:-1)*DRIBBLE.side,0,DRIBBLE.forward);point.y=floor+(top-floor)*fraction;return point;
}
export function crossoverPoint(base:Vec,yaw:number,progress:number,height:number,from:DribbleHand):Vec {
  const p=clamp(progress),floor=COURT.floorY+COURT.ballRadius,top=Math.max(floor,base.y+height),side=from==='right'?1:-1;
  const descending=p<CROSSOVER.bounceFraction,u=descending?p/CROSSOVER.bounceFraction:(p-CROSSOVER.bounceFraction)/(1-CROSSOVER.bounceFraction);
  const x=side*DRIBBLE.side*(descending?1-u:-u),z=descending?DRIBBLE.forward+(CROSSOVER.contactForward-DRIBBLE.forward)*u:CROSSOVER.contactForward+(DRIBBLE.forward-CROSSOVER.contactForward)*u;
  const point=localPoint(base,yaw,x,0,z);point.y=floor+(top-floor)*(descending?1-u*u:2*u-u*u);return point;
}
export function requestCrossover(s:State,repeated=false) {
  const m=s.playerMotion;
  if(repeated||s.owner!=='player'||s.phase!=='HELD'||s.defense.kind||s.player.y>0||s.vy!==0)return false;
  // One fresh press can buffer the reverse stroke, never keyboard auto-repeat.
  if(m.action==='CROSSOVER'&&m.crossover?.stage==='ACTIVE') {
    if(m.crossover.queued)return false;m.crossover.queued=true;return true;
  }
  if(m.action!=='DRIBBLE'||m.crossover)return false;
  m.crossover={stage:'WAIT_HAND_RETURN',elapsed:0,from:m.currentDribbleHand,to:m.currentDribbleHand==='right'?'left':'right',queued:false,returnRate:Math.max(m.rate,(1-m.phase)/CROSSOVER.maxReturnWait)};return true;
}
export function cancelCrossover(m:BallMotion,from:Vec,owned:boolean) {
  if(!m.crossover)return;
  const active=m.crossover.stage==='ACTIVE';m.crossover=null;
  if(active)cancelMotion(m,from,owned);
}
export function cameraSocket(s:State,input:Input,x:number,y:number,z:number):Vec {
  const f=passDirection(input.yaw,input.pitch),u={x:Math.sin(input.yaw)*Math.sin(input.pitch),y:Math.cos(input.pitch),z:Math.cos(input.yaw)*Math.sin(input.pitch)};
  return {x:s.player.x+Math.cos(input.yaw)*x+u.x*y+f.x*z,y:s.player.y+PLAYER.eyeHeight+u.y*y+f.y*z,z:s.player.z-Math.sin(input.yaw)*x+u.z*y+f.z*z};
}
export function heldPocket(s:State,input:Input,owner:'player'|'dummy'):Vec {
  const base=actorPosition(s,owner),yaw=actorYaw(s,input,owner);
  if(owner==='dummy')return s.practice.mode==='BLOCK'?localPoint(base,yaw,0,1.95,.35):localPoint(base,yaw,0,DUMMY.catchY,DUMMY.catchForward);
  const m=s.playerMotion;if(s.phase==='CHARGING'||m.pending?.kind==='shot')return cameraSocket(s,input,SHOT_FORM.setSide,SHOT_FORM.setUp,SHOT_FORM.setForward);
  const forward=passDirection(yaw,input.pitch),up={x:Math.sin(yaw)*Math.sin(input.pitch),y:Math.cos(input.pitch),z:Math.cos(yaw)*Math.sin(input.pitch)},drop=DRIBBLE.pocketHeight-PLAYER.eyeHeight;
  return {x:base.x+forward.x*DRIBBLE.pocketForward+Math.cos(yaw)*DRIBBLE.pocketSide+up.x*drop,y:base.y+PLAYER.eyeHeight+forward.y*DRIBBLE.pocketForward+up.y*drop,z:base.z+forward.z*DRIBBLE.pocketForward-Math.sin(yaw)*DRIBBLE.pocketSide+up.z*drop};
}
export function releaseSocket(s:State,intent:ReleaseIntent,owner:'player'|'dummy'):Vec {
  if(owner==='dummy')return heldPocket(s,intent.input,'dummy');
  if(intent.kind==='pass')return playerPassLaunch(s.player,intent.input,intent.charge).position;
  return cameraSocket(s,intent.input,SHOT_FORM.releaseSide,SHOT_FORM.releaseUp,SHOT_FORM.releaseForward);
}
export function beginGather(m:BallMotion,from:Vec) {m.crossover=null;m.action='GATHER';m.elapsed=0;m.from={...from};m.pending=null;m.fired=false;m.lastKind=null;}
export function beginCatch(m:BallMotion,from:Vec) {m.crossover=null;m.action='CATCH';m.elapsed=0;m.phase=0;m.from={...from};m.pending=null;m.fired=false;}
export function queueRelease(m:BallMotion,intent:ReleaseIntent,from:Vec) {
  if(m.pending)return false;
  m.pending={...intent,input:{...intent.input}};m.lastKind=intent.kind;
  if(m.action!=='GATHER') {m.action='RELEASE';m.elapsed=0;m.from={...from};m.fired=false;}
  return true;
}
export function cancelMotion(m:BallMotion,from:Vec,owned:boolean) {m.crossover=null;m.pending=null;m.fired=false;if(owned)beginCatch(m,from);else {m.action='IDLE';m.elapsed=0;}}
export function markReleased(m:BallMotion,point:Vec,kind:ReleaseIntent['kind']) {m.action='RELEASE';m.elapsed=0;m.fired=true;m.lastKind=kind;m.releasePoint={...point};m.pending=null;}
function followDuration(m:BallMotion){return m.lastKind==='shot'?SHOT_FORM.followHoldSeconds+SHOT_FORM.followReturnSeconds:DRIBBLE.followSeconds;}
function followFade(m:BallMotion){return m.lastKind==='shot'?smooth((m.elapsed-SHOT_FORM.followHoldSeconds)/SHOT_FORM.followReturnSeconds):smooth(m.elapsed/DRIBBLE.followSeconds);}
export function updateUnownedMotion(m:BallMotion,dt:number,moving=false) {
  m.crossover=null;m.clock+=dt;m.locomotion=moving?'MOVE':'IDLE';
  if(m.action==='RELEASE'&&m.fired){m.elapsed+=dt;if(m.elapsed>=followDuration(m)){m.action='IDLE';m.elapsed=0;}}
  else if(m.action!=='IDLE'){m.action='IDLE';m.elapsed=0;m.pending=null;}
}
export function controlledPosition(s:State,input:Input,owner:'player'|'dummy'):Vec {
  const m=owner==='player'?s.playerMotion:s.dummyMotion,base=actorPosition(s,owner),yaw=m.dribbleYaw,aim=m.pending?.input??input;
  if(m.action==='DRIBBLE')return dribblePoint(base,yaw,m.phase,m.height,m.currentDribbleHand);
  if(m.action==='CROSSOVER'&&m.crossover)return crossoverPoint(base,yaw,m.crossover.elapsed/CROSSOVER.duration,m.height,m.crossover.from);
  if(m.action==='CATCH')return mix(m.from,dribblePoint(base,yaw,0,m.height,m.currentDribbleHand),smooth(m.elapsed/DRIBBLE.catchSeconds));
  if(m.action==='GATHER')return mix(m.from,heldPocket(s,aim,owner),smooth(m.elapsed/DRIBBLE.gatherSeconds));
  if(m.action==='RELEASE'&&!m.fired&&m.pending)return mix(m.from,releaseSocket(s,m.pending,owner),smooth(m.elapsed/DRIBBLE.releaseSeconds));
  return heldPocket(s,aim,owner);
}
// Only simulation time advances these values; rendering never advances the clock.
export function advanceControlledMotion(s:State,input:Input,owner:'player'|'dummy',dt:number):boolean {
  const m=owner==='player'?s.playerMotion:s.dummyMotion;
  const moving=owner==='player'&&s.locomotion.speed>GAIT.stopSpeed&&s.player.y===0;m.locomotion=moving?'MOVE':'IDLE';m.clock+=dt;
  // Only the body frame follows yaw with bounded angular velocity; never rotate the camera.
  const yawDelta=Math.atan2(Math.sin(actorYaw(s,input,owner)-m.dribbleYaw),Math.cos(actorYaw(s,input,owner)-m.dribbleYaw));
  m.dribbleYaw+=Math.max(-CROSSOVER.maxYawRate*dt,Math.min(CROSSOVER.maxYawRate*dt,yawDelta));
  let remaining=dt;
  for(let i=0;i<6&&remaining>1e-10;i++) {
    if(m.action==='DRIBBLE') {
      const period=moving?(input.sprint?DRIBBLE.sprintPeriod:DRIBBLE.movePeriod):DRIBBLE.idlePeriod,targetRate=1/period;
      const targetHeight=moving?(input.sprint?DRIBBLE.sprintHeight:DRIBBLE.moveHeight):DRIBBLE.idleHeight;
      const phaseTravel=(t:number)=>m.crossover?.stage==='WAIT_HAND_RETURN'?m.crossover.returnRate*t:targetRate*t+(m.rate-targetRate)*(1-Math.exp(-DRIBBLE.response*t))/DRIBBLE.response;
      let step=remaining,wrap=false;
      if(m.crossover?.stage==='WAIT_HAND_RETURN'&&phaseTravel(step)>=1-m.phase-1e-10) {
        let lo=0,hi=step;for(let n=0;n<36;n++){const mid=(lo+hi)/2;if(phaseTravel(mid)<1-m.phase)lo=mid;else hi=mid;}step=hi;wrap=true;
      }
      const travel=phaseTravel(step),decay=Math.exp(-DRIBBLE.response*step);
      m.phase=(m.phase+travel)%1;m.rate=targetRate+(m.rate-targetRate)*decay;m.height=targetHeight+(m.height-targetHeight)*decay;m.elapsed+=step;remaining-=step;
      if(wrap&&m.crossover) {m.phase=0;m.action='CROSSOVER';m.elapsed=0;m.crossover.stage='ACTIVE';m.crossover.elapsed=0;}
    } else if(m.action==='CROSSOVER'&&m.crossover) {
      const step=Math.min(remaining,Math.max(0,CROSSOVER.duration-m.crossover.elapsed));
      m.crossover.elapsed+=step;m.elapsed+=step;remaining-=step;s.ball=controlledPosition(s,input,owner);
      if(m.crossover.elapsed+1e-9>=CROSSOVER.duration) {
        const next=m.crossover;m.currentDribbleHand=next.to;m.elapsed=0;m.phase=0;
        // Both strokes share the receiving-hand endpoint; no extra same-hand bounce.
        if(next.queued)m.crossover={stage:'ACTIVE',elapsed:0,from:next.to,to:next.from,queued:false,returnRate:next.returnRate};
        else {m.crossover=null;m.action='DRIBBLE';}
      }
    } else if(m.action==='GATHER'||m.action==='CATCH'||(m.action==='RELEASE'&&!m.fired)) {
      const duration=m.action==='GATHER'?DRIBBLE.gatherSeconds:m.action==='CATCH'?DRIBBLE.catchSeconds:DRIBBLE.releaseSeconds;
      const step=Math.min(remaining,Math.max(0,duration-m.elapsed));m.elapsed+=step;remaining-=step;
      s.ball=controlledPosition(s,input,owner);
      if(m.elapsed+1e-9<duration)break;
      if(m.action==='RELEASE')return true;
      if(m.action==='CATCH') {m.action='DRIBBLE';m.elapsed=0;m.phase=0;}
      else if(m.pending) {m.action='RELEASE';m.elapsed=0;m.from={...s.ball};}
      else {m.action=s.phase==='PASS_CHARGING'?'PASS_CHARGE':'SHOT_CHARGE';m.elapsed=0;}
    } else {m.elapsed+=remaining;remaining=0;}
  }
  s.ball=controlledPosition(s,input,owner);return false;
}
// Core pose sockets are display inputs, never read back from Babylon joints.
export function characterPose(s:State,input:Input,owner:'player'|'dummy',fixedBase?:Vec) {
  const m=owner==='player'?s.playerMotion:s.dummyMotion,actorBase=fixedBase??actorPosition(s,owner),base={...actorBase,y:actorBase.y+(owner==='player'?COURT.floorY:0)},yaw=fixedBase?Math.atan2(s.player.x-fixedBase.x,s.player.z-fixedBase.z):(m.action==='DRIBBLE'||m.action==='CROSSOVER'||m.action==='CATCH')?m.dribbleYaw:actorYaw(s,input,owner),owned=!fixedBase&&s.owner===owner;
  // Aim pitch orients hands around the ball; the torso/shoulders stay upright.
  const aimBlend=m.action==='GATHER'?smooth(m.elapsed/DRIBBLE.gatherSeconds):(m.action==='SHOT_CHARGE'||m.action==='PASS_CHARGE'||(m.action==='RELEASE'&&!m.fired))?1:(m.action==='RELEASE'&&m.fired)?1-followFade(m):0;
  const pitch=owner==='player'&&!s.defense.kind?input.pitch*aimBlend:0;
  const isShot=(owner==='dummy'&&s.practice.mode==='BLOCK'&&(m.action==='GATHER'||m.action==='SHOT_CHARGE'||(m.action==='RELEASE'&&m.lastKind==='shot')))||owner==='player'&&(s.phase==='CHARGING'||m.pending?.kind==='shot'||(m.action==='RELEASE'&&m.fired&&m.lastKind==='shot'));
  const shooting=isShot?(m.action==='GATHER'?smooth(m.elapsed/DRIBBLE.gatherSeconds):m.action==='RELEASE'&&m.fired?1-followFade(m):1):0;
  const crossProgress=m.crossover?.stage==='ACTIVE'?clamp(m.crossover.elapsed/CROSSOVER.duration):0;
  const crossing=m.action==='CROSSOVER'&&m.crossover?.stage==='ACTIVE';
  const crossSide=m.crossover?.from==='left'?-1:1;
  const torsoSide=crossing?crossSide*CROSSOVER.bodyShift*Math.sin(2*Math.PI*crossProgress):0;
  const defending=owner==='player'?s.defense.stance:(!owned?1:0);
  const defenseAction=owner==='player'?s.defense.kind:null;
  const gait=owner==='player'?s.locomotion:null,locomotion=!!gait&&gait.blend>.001&&s.player.y===0;
  const step=locomotion?Math.sin(gait!.phase)*(GAIT.walkAngle+(GAIT.runAngle-GAIT.walkAngle)*gait!.run)*gait!.blend:0;
  const velocity=gait?.velocity??{x:0,z:0},horizontal=Math.hypot(velocity.x,velocity.z);
  const stepSide=horizontal>GAIT.stopSpeed?(velocity.x*Math.cos(yaw)-velocity.z*Math.sin(yaw))/horizontal:gait?.side??0;
  const stepForward=horizontal>GAIT.stopSpeed?(velocity.x*Math.sin(yaw)+velocity.z*Math.cos(yaw))/horizontal:gait?.forward??1;
  const pelvisSway=locomotion?Math.sin(gait!.phase)*GAIT.pelvisSway*gait!.blend:0;
  const legBend=(shooting*SHOT_FORM.groundHipBend+(crossing?CROSSOVER.kneeBend*Math.sin(Math.PI*crossProgress):0))*(actorBase.y<=(owner==='dummy'?COURT.floorY:SHOT_FORM.groundedHeight)?1:0);
  const defenseBend=defending*DEFENSE.stanceBend*(base.y<=COURT.floorY+.001?1:0);
  const totalBend=legBend+defenseBend;
  const strideAngle=locomotion?(GAIT.walkAngle+(GAIT.runAngle-GAIT.walkAngle)*gait!.run)*gait!.blend:0;
  const pelvisDrop=(CHARACTER.upperLeg+CHARACTER.lowerLeg)*(1-Math.cos(totalBend))+(locomotion?(CHARACTER.upperLeg+CHARACTER.lowerLeg)*(1-Math.cos(strideAngle))+GAIT.pelvisBob*(1-Math.cos(gait!.phase*2))*gait!.blend:0);
  const block=DEFENSE.block,blockExtension=defenseAction==='BLOCK'?Math.max(0,Math.min(1,s.defense.elapsed/block.prepare,(block.prepare+block.active+block.recover-s.defense.elapsed)/block.recover)):0;
  const pelvisBack=(CHARACTER.upperLeg-CHARACTER.lowerLeg)*Math.sin(totalBend),shoulderLift=shooting*SHOT_FORM.shoulderLift+block.shoulderLift*blockExtension;
  const up={x:Math.sin(yaw)*Math.sin(pitch),y:Math.cos(pitch),z:Math.cos(yaw)*Math.sin(pitch)},forward=passDirection(yaw,pitch);
  const idle=(side:number)=>localPoint(base,yaw,side*DUMMY.armX,DUMMY.handY,DUMMY.handForward+.012*Math.sin(m.clock*1.6));
  let right=idle(1),left=idle(-1),wrist=0,rightWrist=0,leftWrist=0;
  const offset=(ball:Vec,side:number)=>({x:ball.x+Math.cos(yaw)*side*.14-up.x*.04-forward.x*.04,y:ball.y-up.y*.04-forward.y*.04,z:ball.z-Math.sin(yaw)*side*.14-up.z*.04-forward.z*.04});
  const paired=(ball:Vec)=>({right:offset(ball,1),left:offset(ball,-1)});
  const shotHands=(ball:Vec)=>{
    const extend=m.action==='RELEASE'?(m.fired?1:smooth(m.elapsed/DRIBBLE.releaseSeconds)):0;
    const point=(x:number,y:number,z:number)=>({x:ball.x+Math.cos(yaw)*x+up.x*y+forward.x*z,y:ball.y+up.y*y+forward.y*z,z:ball.z-Math.sin(yaw)*x+up.z*y+forward.z*z});
    return {right:point(.025,-.16,-.055-.025*extend),left:point(-.16,-.015+.02*extend,-.025*extend)};
  };
  if(owned) {
    if(m.action==='DRIBBLE') {
      const sign=m.currentDribbleHand==='right'?1:-1,contact=clamp((s.ball.y-base.y-.78)/(m.height-.78));
      const palm=localPoint(base,yaw,sign*DRIBBLE.side,DRIBBLE.minHandHeight+(m.height+COURT.ballRadius+CHARACTER.handWidth/2-DRIBBLE.minHandHeight)*contact,.27+(DRIBBLE.forward-.27)*contact);
      if(sign===1)right=palm;else left=palm;
      const rise=(m.phase-DRIBBLE.pushFraction)/(1-DRIBBLE.pushFraction);
      wrist=m.phase<DRIBBLE.pushFraction?1-m.phase/DRIBBLE.pushFraction:-Math.sin(Math.PI*rise)*.3+smooth((rise-.65)/.35);
      if(sign===1)rightWrist=wrist;else leftWrist=wrist;
    } else if(crossing&&m.crossover) {
      const down=crossProgress<CROSSOVER.bounceFraction,u=down?crossProgress/CROSSOVER.bounceFraction:(crossProgress-CROSSOVER.bounceFraction)/(1-CROSSOVER.bounceFraction);
      const contact=clamp((s.ball.y-base.y-.78)/(m.height-.78));
      const push=localPoint(base,yaw,crossSide*DRIBBLE.side*(1-.6*Math.min(1,down?u:1)),DRIBBLE.minHandHeight+(m.height+COURT.ballRadius+CHARACTER.handWidth/2-DRIBBLE.minHandHeight)*contact,.27+(DRIBBLE.forward-.27)*contact);
      const ready=localPoint(base,yaw,-crossSide*DRIBBLE.side,DRIBBLE.minHandHeight,.27);
      const receiving=localPoint(base,yaw,-crossSide*DRIBBLE.side,DRIBBLE.minHandHeight+(m.height+COURT.ballRadius+CHARACTER.handWidth/2-DRIBBLE.minHandHeight)*contact,.27+(DRIBBLE.forward-.27)*contact);
      const sender=down?push:mix(push,idle(crossSide),smooth(u));
      const receiver=down?mix(idle(-crossSide),ready,smooth(u)):mix(ready,receiving,smooth(u));
      if(crossSide===1){right=sender;left=receiver;rightWrist=down?1-u:0;leftWrist=down?0:-Math.sin(Math.PI*u)*.3+smooth((u-.65)/.35);}else{left=sender;right=receiver;leftWrist=down?1-u:0;rightWrist=down?0:-Math.sin(Math.PI*u)*.3+smooth((u-.65)/.35);}

    } else {
      ({right,left}=paired(s.ball));
      if(shooting>0){const hands=shotHands(s.ball);right=mix(right,hands.right,shooting);left=mix(left,hands.left,shooting);
        const snap=m.action==='RELEASE'?smooth(m.elapsed/DRIBBLE.releaseSeconds):0;
        wrist=shooting*(SHOT_FORM.wristChargeAngle+(SHOT_FORM.wristReleaseAngle-SHOT_FORM.wristChargeAngle)*snap);
        rightWrist=wrist;leftWrist=-.08*shooting;
      }
      if(s.ball.y<base.y+DRIBBLE.minHandHeight) {right.y=left.y=base.y+DRIBBLE.minHandHeight;right.z=idle(1).z;left.z=idle(-1).z;}
      if(m.action==='CATCH') {const t=smooth((m.elapsed/DRIBBLE.catchSeconds-.5)*2);if(m.currentDribbleHand==='right')left=mix(left,idle(-1),t);else right=mix(right,idle(1),t);}
    }
  } else if(m.action==='RELEASE'&&m.fired) {
    const direction=owner==='player'?passDirection(input.yaw,input.pitch):{x:Math.sin(yaw),y:0,z:Math.cos(yaw)};
    const p={x:m.releasePoint.x+direction.x*.1,y:m.releasePoint.y+direction.y*.1,z:m.releasePoint.z+direction.z*.1};
    const hands=isShot?shotHands(p):paired(p),fade=followFade(m);
    if(isShot){
      const extended=localPoint(base,yaw,CHARACTER.shoulderX-.02,CHARACTER.shoulderY-pelvisDrop+shoulderLift+SHOT_FORM.followHandUp,SHOT_FORM.followHandForward-pelvisBack);
      const guide=localPoint(base,yaw,SHOT_FORM.followGuideSide,CHARACTER.shoulderY-pelvisDrop+shoulderLift+SHOT_FORM.followGuideUp,SHOT_FORM.followGuideForward-pelvisBack);
      const reach=smooth(m.elapsed/SHOT_FORM.followReachSeconds);
      right=mix(mix(hands.right,extended,reach),right,fade);
      left=mix(mix(hands.left,guide,reach),left,fade);
      rightWrist=SHOT_FORM.wristReleaseAngle*(1-fade);leftWrist=.05*(1-fade);
    }else{right=mix(hands.right,right,fade);left=mix(hands.left,left,fade);}
  }
  if(!owned&&(!(m.action==='RELEASE'&&m.fired)||defenseAction)) {
    right=mix(right,localPoint(base,yaw,DEFENSE.handSide,DEFENSE.handHeight,DEFENSE.handForward),defending);
    left=mix(left,localPoint(base,yaw,-DEFENSE.handSide,DEFENSE.handHeight,DEFENSE.handForward),defending);
    if(owner==='player'){const swing=Math.sin(s.locomotion.phase);right=mix(right,localPoint(base,yaw,.3,1.1+.05*swing,.2+.14*swing),s.defense.running);left=mix(left,localPoint(base,yaw,-.3,1.1-.05*swing,.2-.14*swing),s.defense.running);}
    if(defenseAction){right=defenseHand(actorBase,yaw,defenseAction,s.defense.elapsed);if(defenseAction==='BLOCK'){const side=(right.x-base.x)*Math.cos(yaw)-(right.z-base.z)*Math.sin(yaw);left={x:right.x-2*Math.cos(yaw)*side,y:right.y,z:right.z+2*Math.sin(yaw)*side};}}
  }
  if(m.action!=='DRIBBLE'&&!crossing&&!(isShot&&shooting>0)){rightWrist=leftWrist=wrist;}
  const reachable=(p:Vec,side:number)=>{
    const shoulder=localPoint(base,yaw,side*CHARACTER.shoulderX+torsoSide,CHARACTER.shoulderY-pelvisDrop+shoulderLift,-pelvisBack);
    const dx=p.x-shoulder.x,dy=p.y-shoulder.y,dz=p.z-shoulder.z;
    const length=Math.hypot(dx,dy,dz),reach=CHARACTER.upperArm+CHARACTER.forearm+CHARACTER.handLength/2-.005,scale=Math.min(1,reach/Math.max(length,1e-8));
    return {x:shoulder.x+dx*scale,y:shoulder.y+dy*scale,z:shoulder.z+dz*scale};
  };
  return {position:{...base},attacking:owned||m.action==='RELEASE',yaw,pitch,shooting,torsoSide,legBend:totalBend,step,stepSide,stepForward,pelvisSway,gaitPhase:gait?.phase??0,gaitBlend:locomotion?gait!.blend:0,airborne:owner==='player'&&s.player.y>0,pelvisDrop,pelvisBack,shoulderLift,rightHand:reachable(right,1),leftHand:reachable(left,-1),wrist,rightWrist,leftWrist,dribbleHand:m.currentDribbleHand,crossoverStage:m.crossover?.stage??'NONE',crossoverProgress:crossProgress,action:m.action,locomotion:m.locomotion,clock:m.clock,ballSocket:owned?{...s.ball}:null};
}
export type CharacterPose=ReturnType<typeof characterPose>;
