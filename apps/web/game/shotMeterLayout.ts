import {CFG} from '../../../packages/game-core/src/simulation';
// Presentation only: current PERFECT RELEASE timing is idealCharge ± .05 seconds.
export const SHOT_METER={worldOffset:1.25,worldHeight:2.8,minHeight:140,maxHeight:340,width:22,margin:16,perfectHalfSeconds:.05} as const;
export const SHOT_ZONE={center:CFG.idealCharge/CFG.maxCharge,bottom:(CFG.idealCharge-SHOT_METER.perfectHalfSeconds)/CFG.maxCharge,height:SHOT_METER.perfectHalfSeconds*2/CFG.maxCharge};
export function shotMeterLayout(rimY:number,anchorX:number,width:number,height:number,projectedHeight:number){
 if(!Number.isFinite(rimY+anchorX+width+height+projectedHeight)||width<=0||height<=0||anchorX<SHOT_METER.margin||anchorX>width-SHOT_METER.margin)return null;
 // Shrink near screen edges rather than moving the green band away from the rim.
 const size=Math.min(Math.max(SHOT_METER.minHeight,projectedHeight),SHOT_METER.maxHeight,height*.5,(rimY-SHOT_METER.margin)/(1-SHOT_ZONE.center),(height-SHOT_METER.margin-rimY)/SHOT_ZONE.center);
 if(size<80)return null;
 return {left:anchorX,top:rimY-size*(1-SHOT_ZONE.center),height:size,width:Math.max(12,Math.min(SHOT_METER.width,size*.075))};
}
