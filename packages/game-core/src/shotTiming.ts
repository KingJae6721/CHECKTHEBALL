import {COURT,SHOT_TIMING} from './court';
export function shotDistance(position:{x:number;z:number}){return Math.hypot(position.x-COURT.rim.x,position.z-COURT.rim.z);}
export function shotTimingWindow(distance:number){
 const d=Number.isFinite(distance)?distance:SHOT_TIMING.farDistance;
 if(d<=SHOT_TIMING.nearDistance)return SHOT_TIMING.nearHalfWindow;
 if(d>=SHOT_TIMING.farDistance)return SHOT_TIMING.farHalfWindow;
 const t=Math.max(0,Math.min(1,(d-SHOT_TIMING.nearDistance)/(SHOT_TIMING.farDistance-SHOT_TIMING.nearDistance)));
 return SHOT_TIMING.nearHalfWindow+(SHOT_TIMING.farHalfWindow-SHOT_TIMING.nearHalfWindow)*t;
}
export function evaluateShotTiming(charge:number,distance:number){
 const halfWindow=shotTimingWindow(distance),delta=charge-SHOT_TIMING.idealCharge;
 // Preserve the original trajectory scale at the reference timing window.
 const error=Math.max(-1,Math.min(1,delta/(.5*halfWindow/SHOT_TIMING.referenceHalfWindow)));
 return {error,perfect:Math.abs(delta)<halfWindow,halfWindow};
}
