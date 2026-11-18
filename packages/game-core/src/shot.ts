import {CFG,type Vec} from './simulation';
import {evaluateShotTiming} from './shotTiming';
// Shared existing assisted shot trajectory. No renderer or practice-mode dependency.
export function assistedShotVelocity(start:Vec,yaw:number,pitch:number,charge:number,timingDistance?:number){
 const distance=Math.hypot(CFG.rim.x-start.x,CFG.rim.z-start.z),{error}=evaluateShotTiming(charge,timingDistance??distance);
 const travel=Math.max(1,distance+error*(.9+distance*.12)),duration=Math.max(.8,Math.min(1.5,.9+distance*.045));
 return {x:Math.sin(yaw)*travel/duration,y:(CFG.rim.y-Math.sin(pitch)*.35-start.y+.5*CFG.gravity*duration*duration)/duration,z:Math.cos(yaw)*travel/duration};
}
