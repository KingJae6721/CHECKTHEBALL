import {CFG} from '../../../packages/game-core/src/simulation';
import {shotTimingWindow} from '../../../packages/game-core/src/shotTiming';
export const SHOT_METER={worldOffset:1.25,worldHeight:2.8,minHeight:140,maxHeight:340,width:22,margin:16} as const;
export function shotMeterZone(distance:number){const half=shotTimingWindow(distance);return {center:CFG.idealCharge/CFG.maxCharge,bottom:(CFG.idealCharge-half)/CFG.maxCharge,height:half*2/CFG.maxCharge};}
export const SHOT_ZONE=shotMeterZone(0);
export function shotMeterLayout(rimY:number,anchorX:number,width:number,height:number,projectedHeight:number){
 if(!Number.isFinite(rimY+anchorX+width+height+projectedHeight)||width<=0||height<=0||anchorX<SHOT_METER.margin||anchorX>width-SHOT_METER.margin)return null;
 // Shrink near screen edges rather than moving the green band away from the rim.
 const size=Math.min(Math.max(SHOT_METER.minHeight,projectedHeight),SHOT_METER.maxHeight,height*.5,(rimY-SHOT_METER.margin)/(1-SHOT_ZONE.center),(height-SHOT_METER.margin-rimY)/SHOT_ZONE.center);
 if(size<80)return null;
 return {left:anchorX,top:rimY-size*(1-SHOT_ZONE.center),height:size,width:Math.max(12,Math.min(SHOT_METER.width,size*.075))};
}
