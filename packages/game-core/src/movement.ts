import {MOVEMENT} from './court';
import {movePair,moveBody,bodyShapes} from './bodies';
import {advanceScreen,type ScreenState} from './screen';
import {CFG,type Vec,type Input,type Phase} from './simulation';
export type MovingActor={position:Vec;vy:number;phase:Phase;input:Input;enabled:boolean;jump:boolean;screen?:ScreenState};
// Shared server/client movement only. Never runs ball, score, steal or block rules.
export function integrateMovement(actors:MovingActor[],dt=CFG.dt){
 actors.forEach(a=>{if(a.screen)advanceScreen(a.screen,a.enabled&&(a.input.x!==0||a.input.z!==0||a.jump),a.position.y>0||a.vy>0,dt);});
 const deltas=actors.map(a=>{const i=a.input,length=Math.max(1,Math.hypot(i.x,i.z)),speed=(i.sprint?MOVEMENT.run:MOVEMENT.walk)*(a.phase==='CHARGING'?MOVEMENT.chargeScale:1)*(a.position.y>0?MOVEMENT.airScale:1);
  return a.enabled?{x:(i.x*Math.cos(i.yaw)+i.z*Math.sin(i.yaw))/length*speed*dt,z:(-i.x*Math.sin(i.yaw)+i.z*Math.cos(i.yaw))/length*speed*dt}:{x:0,z:0};});
 const diagnostics={recovered:false,reason:'movement'};
 const positions=actors.some(a=>a.screen?.active)?actors.map((a,i)=>{
  if(a.screen?.active||!a.enabled)return {...a.position};
  const obstacles=actors.flatMap((b,j)=>i===j?[]:bodyShapes('actor-'+j,b.position,b.screen));
  const result=moveBody(a.position,deltas[i],obstacles);
  if(result.recovered){diagnostics.recovered=true;diagnostics.reason=result.safeReset?'screen-safe-reset':'screen-overlap-recovery';}
  return result.position;
 }):movePair(actors.map(a=>a.position),deltas,diagnostics);
 actors.forEach((a,index)=>{if(a.jump&&a.position.y===0&&a.vy===0)a.vy=CFG.jump;Object.assign(a.position,positions[index]);a.position.y+=a.vy*dt-.5*CFG.gravity*dt*dt;a.vy-=CFG.gravity*dt;if(a.position.y<=0){a.position.y=0;a.vy=0;}});
 return diagnostics;
}
