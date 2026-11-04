import {integrateMovement,type MovingActor} from '../../../packages/game-core/src/movement';
import {NETWORK} from '../../../packages/protocol/src/index';
import {recoverBody} from '../../../packages/game-core/src/bodies';
import {BODY} from '../../../packages/game-core/src/court';
import {advanceLocomotion} from '../../../packages/game-core/src/locomotion';
import {CFG} from '../../../packages/game-core/src/simulation';
import type {ActorSnapshot} from '../../../packages/protocol/src/index';
import type {Input,Phase,Vec} from '../../../packages/game-core/src/simulation';
export type PredictedCommand={seq:number;moveSeq:number;input:Input;jump:boolean;phase:Phase;phaseSeq:number;sentAt?:number};
const distance=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export class MovementPrediction{
 actor:ActorSnapshot|undefined;remote:ActorSnapshot|undefined;pending:PredictedCommand[]=[];
 position:Vec={x:0,y:0,z:0};vy=0;offset:Vec={x:0,y:0,z:0};
 corrections=0;lastCorrection=0;serverError=0;replayError=0;writer='waiting-authority';resets=0;
 simulate(command:PredictedCommand,authority:ActorSnapshot){
  const phase=command.phaseSeq>authority.processedActionSeq?command.phase:authority.phase;
  const local:MovingActor={position:this.position,vy:this.vy,phase,input:command.input,enabled:true,jump:command.jump};
  // Conservative collision proxy at the latest authoritative remote position.
  // The server still solves both moving actors and is the final authority.
  const actors=[local];if(this.remote){const p=this.remote.position;Object.assign(this.position,recoverBody(this.position,[{id:this.remote.id,x:p.x,z:p.z,radius:BODY.radius}]).position);actors.push({position:{...p},vy:0,phase:this.remote.phase,input:this.remote.input,enabled:false,jump:false});}
  const before={...this.position};integrateMovement(actors);this.vy=local.vy;
  if(this.actor){this.actor.vy=this.vy;advanceLocomotion(this.actor.locomotion,this.position.x-before.x,this.position.z-before.z,CFG.dt,command.input.yaw,this.position.y===0);}
 }
 accept(authority:ActorSnapshot,remote:ActorSnapshot|undefined,reset=false){
  const hadActor=!!this.actor,before={...this.position},visual={x:this.position.x+this.offset.x,y:this.position.y+this.offset.y,z:this.position.z+this.offset.z};
  this.remote=remote;this.serverError=hadActor?distance(before,authority.position):0;
  this.pending=this.pending.filter(c=>c.moveSeq>authority.processedMoveSeq);
  Object.assign(this.position,authority.position);this.vy=authority.vy;
  this.actor={...authority,position:this.position,locomotion:{...authority.locomotion,velocity:{...authority.locomotion.velocity}}};
  if(reset)this.pending.length=0;else for(const command of this.pending)this.simulate(command,authority);
  this.replayError=hadActor?distance(before,this.position):0;
  if(hadActor&&this.replayError>NETWORK.positionEpsilon){this.corrections++;this.lastCorrection=this.replayError;}
  // Logical correction is already complete. Only a small visual residual decays.
  if(!reset&&hadActor&&this.replayError<NETWORK.visualSnapDistance&&distance(visual,this.position)<NETWORK.visualSnapDistance){this.offset.x=visual.x-this.position.x;this.offset.y=visual.y-this.position.y;this.offset.z=visual.z-this.position.z;}
  else this.clearOffset();
  this.writer=reset?'client:authority-reset':'client:authority+pending-replay';if(reset)this.resets++;
 }
 push(command:PredictedCommand){if(!this.actor)return;this.pending.push(command);this.simulate(command,this.actor);this.writer='client:fixed-prediction';}
 clearOffset(){this.offset.x=0;this.offset.y=0;this.offset.z=0;}
 visualStep(dt:number){const decay=Math.exp(-NETWORK.visualResponse*dt);this.offset.x*=decay;this.offset.y*=decay;this.offset.z*=decay;}
}
