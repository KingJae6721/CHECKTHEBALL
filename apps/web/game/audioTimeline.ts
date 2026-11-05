import type {GameEvent} from '../../../packages/game-core/src/gameEvents';
import type {BallMotion} from '../../../packages/game-core/src/motion';
import type {Locomotion} from '../../../packages/game-core/src/locomotion';
import type {Vec} from '../../../packages/game-core/src/simulation';
import {CROSSOVER,DRIBBLE} from '../../../packages/game-core/src/court';
import {AUDIO,type SoundKind} from './audioConfig';
export type SoundCue={key:string;kind:SoundKind;position:Vec;strength:number;near?:boolean;actorId?:string};
// No timers. The displayed server timeline decides when a confirmed event is audible.
export class AudioTimeline{
 private initialized=false;private seen=new Map<number,number>();private pending:GameEvent[]=[];private highestReceived=0;
 ingest(events:GameEvent[],now:number){
  if(!this.initialized){this.initialized=true;for(const e of events){this.seen.set(e.eventId,now);this.highestReceived=Math.max(this.highestReceived,e.eventId);}return;}
  for(const e of events){if(e.eventId<=this.highestReceived||this.seen.has(e.eventId))continue;this.highestReceived=e.eventId;this.seen.set(e.eventId,now);this.pending.push(e);}
  this.pending=this.pending.filter(e=>now-(this.seen.get(e.eventId)??-Infinity)<=AUDIO.maxWaitMs);
  this.pending.sort((a,b)=>a.time-b.time||a.eventId-b.eventId);
  if(this.pending.length>AUDIO.maxQueued)this.pending.splice(0,this.pending.length-AUDIO.maxQueued);
  for(const [id,time] of this.seen)if(now-time>AUDIO.seenMs)this.seen.delete(id);
  while(this.seen.size>AUDIO.maxSeen)this.seen.delete(this.seen.keys().next().value!);
 }
 drain(displayTime:number,selfTime:number,selfId:string):GameEvent[]{
  const ready:GameEvent[]=[],future:GameEvent[]=[];
  for(const e of this.pending){const time=e.actorId===selfId&&(e.kind==='jump'||e.kind==='land'||e.kind==='blockJump'||e.kind==='catch')?selfTime:displayTime;
   if(e.time>time)future.push(e);else if(time-e.time<=AUDIO.lateMs)ready.push(e);
  }this.pending=future;return ready;
 }
 discard(){this.pending.length=0;}
 get queued(){return this.pending.length;}
}
export type AudibleActor={id:string;position:Vec;vy:number;motion:BallMotion;locomotion:Locomotion;owns:boolean;near:boolean;block:boolean};
type Previous={time:number;phase:number;clock:number;action:string;cross:number;crossActive:boolean;lastBounce:number;air:boolean;serial:number};
// Visual phase crossings only; prediction replay never invokes this collector.
export class MotionSounds{
 private previous=new Map<string,Previous>();
 sample(a:AudibleActor,now:number,offline=false):SoundCue[]{
  const m=a.motion,p=this.previous.get(a.id),active=m.action==='CROSSOVER'&&m.crossover?.stage==='ACTIVE',cross=m.crossover?.elapsed??0,air=a.position.y>0||a.vy>0;
  const next:Previous={time:now,phase:m.phase,clock:m.clock,action:m.action,cross,crossActive:!!active,lastBounce:p?.lastBounce??-Infinity,air,serial:p?.serial??0};
  this.previous.set(a.id,next);if(!p||now-p.time>AUDIO.maxMotionGapMs||now<p.time)return [];
  const cues:SoundCue[]=[];
  const push=(kind:SoundKind,strength:number)=>cues.push({key:`visual:${a.id}:${++next.serial}`,actorId:a.id,kind,position:{...a.position},strength,near:a.near});
  const crossed=(phase:number,old:number,mark:number)=>phase>=old?old<mark&&phase>=mark:old<mark||phase>=mark;
  const normal=m.action==='DRIBBLE'&&p.action==='DRIBBLE'&&crossed(m.phase,p.phase,DRIBBLE.pushFraction);
  const crossover=active&&p.crossActive&&p.cross<CROSSOVER.duration*CROSSOVER.bounceFraction&&cross>=CROSSOVER.duration*CROSSOVER.bounceFraction;
  if(a.owns&&!air&&(normal||crossover)&&m.clock-next.lastBounce>.22){push('dribble',1);next.lastBounce=m.clock;}
  if(offline&&air&&!p.air)push(a.block?'blockJump':'jump',1);
  if(offline&&!air&&p.air)push('land',1);
  return cues;
 }
 retain(ids:string[]){for(const id of this.previous.keys())if(!ids.includes(id))this.previous.delete(id);}
 clear(){this.previous.clear();}
}
