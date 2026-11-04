import {GAIT,MOVEMENT,HEAD_BOB} from './court';
import type {BodyMove} from './bodies';
export type Locomotion={phase:number;cadence:number;speed:number;blend:number;run:number;side:number;forward:number;velocity:{x:number;z:number};distance:number;collision:BodyMove|null};
export function createLocomotion():Locomotion{return {phase:0,cadence:0,speed:0,blend:0,run:0,side:0,forward:0,velocity:{x:0,z:0},distance:0,collision:null};}
export function advanceLocomotion(m:Locomotion,dx:number,dz:number,dt:number,yaw:number,grounded:boolean){
 const distance=Math.hypot(dx,dz),speed=distance/dt,decay=Math.exp(-GAIT.response*dt),moving=grounded&&speed>GAIT.stopSpeed;
 m.velocity={x:dx/dt,z:dz/dt};m.speed=speed;m.distance+=distance;
 const strength=moving?Math.min(1,speed/MOVEMENT.walk):0,run=moving?Math.max(0,Math.min(1,(speed-MOVEMENT.walk)/(MOVEMENT.run-MOVEMENT.walk))):0;
 m.blend=strength+(m.blend-strength)*decay;
 m.run=run+(m.run-run)*decay;
 // Smooth the shared foot/camera cadence from actual speed, never held keys.
 const stride=GAIT.walkStride+(GAIT.runStride-GAIT.walkStride)*run;
 const targetCadence=moving?speed/stride:0,response=Math.max(.001,HEAD_BOB.smoothing),cadenceDecay=Math.exp(-response*dt);
 const cycles=targetCadence*dt+(m.cadence-targetCadence)*(1-cadenceDecay)/response;
 m.cadence=targetCadence+(m.cadence-targetCadence)*cadenceDecay;
 if(moving){m.side=(dx*Math.cos(yaw)-dz*Math.sin(yaw))/distance;m.forward=(dx*Math.sin(yaw)+dz*Math.cos(yaw))/distance;
  m.phase=(m.phase+cycles*Math.PI*2)%(Math.PI*2);
 }
 if(!grounded){m.blend=0;m.run=0;}
}
