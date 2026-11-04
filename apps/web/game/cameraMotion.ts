import {GAIT,HEAD_BOB} from '../../../packages/game-core/src/court';
import type {State} from '../../../packages/game-core/src/simulation';

// Renderer-owned offsets. Never write these back to the simulation or aim input.
export type CameraMotion={side:number;up:number};
export const createCameraMotion=():CameraMotion=>({side:0,up:0});
export function resetCameraMotion(m:CameraMotion){m.side=0;m.up=0;}
export function advanceCameraMotion(m:CameraMotion,s:State,dt:number,enabled:boolean,playing:boolean){
 const motion=s.playerMotion;
 // A pending release must use the exact unshifted core camera ray, even with
 // nonzero custom charging settings. Jump/disable/reset leave no stale offset.
 if(!enabled||!playing||s.player.y>0||s.vy!==0||motion.pending||motion.action==='RELEASE'){
  resetCameraMotion(m);return;
 }
 const charging=s.phase==='CHARGING'||s.phase==='PASS_CHARGING'||motion.action==='GATHER';
 const chargeScale=charging?Math.max(0,Math.min(1,HEAD_BOB.chargeScale)):1;
 if(charging&&chargeScale===0){resetCameraMotion(m);return;}
 const gait=s.locomotion,moving=gait.speed>GAIT.stopSpeed;
 const run=Math.max(0,Math.min(1,gait.run)),strength=moving?gait.blend*chargeScale:0;
 const up=(HEAD_BOB.walkUp+(HEAD_BOB.runUp-HEAD_BOB.walkUp)*run)*strength;
 const side=(HEAD_BOB.walkSide+(HEAD_BOB.runSide-HEAD_BOB.walkSide)*run)*strength;
 const decay=Math.exp(-HEAD_BOB.smoothing*Math.max(0,dt));
 const targetUp=-Math.cos(2*gait.phase)*up,targetSide=Math.sin(gait.phase)*side;
 m.up=targetUp+(m.up-targetUp)*decay;m.side=targetSide+(m.side-targetSide)*decay;
 if(!moving&&Math.abs(m.up)+Math.abs(m.side)<1e-6)resetCameraMotion(m);
}
