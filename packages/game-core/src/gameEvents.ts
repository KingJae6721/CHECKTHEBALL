import type {Vec} from './simulation';
export type GameEventKind='floor'|'rim'|'board'|'net'|'jump'|'land'|'blockJump'|'blockHit';
export type GameEvent={eventId:number;kind:GameEventKind;serverTick:number;time:number;actorId:string|null;shotId:number;actionId:string;position:Vec;strength:number;contacted?:boolean};
export type EventLog={sequence:number;recent:GameEvent[];impactAt:Partial<Record<GameEventKind,number>>;shotId:number;rim:boolean;board:boolean};
export const EVENT_LIMITS={capacity:128,retentionMs:2000,impactMinSpeed:.65,contactGapMs:60};
export function createEventLog():EventLog{return {sequence:0,recent:[],impactAt:{},shotId:-1,rim:false,board:false};}
type Source={events:EventLog;tick:number;shotId:number};
export function emitGameEvent(s:Source,kind:GameEventKind,position:Vec,strength=1,actorId:string|null=null,actionId=''){
 const log=s.events,time=s.tick*1000/60;
 const event:GameEvent={eventId:++log.sequence,kind,serverTick:s.tick,time,actorId,shotId:s.shotId,actionId:actionId||`${actorId??'ball'}:${s.tick}:${kind}`,position:{...position},strength};
 if(kind==='net')event.contacted=log.shotId===s.shotId&&(log.rim||log.board);
 log.recent.push(event);while(log.recent.length>EVENT_LIMITS.capacity||log.recent.length>0&&time-log.recent[0].time>EVENT_LIMITS.retentionMs)log.recent.shift();return event;
}
export function impactEvent(s:Source,kind:'floor'|'rim'|'board',position:Vec,strength:number){
 const log=s.events,time=s.tick*1000/60;
 if(log.shotId!==s.shotId){log.shotId=s.shotId;log.rim=false;log.board=false;}
 if(kind==='rim')log.rim=true;if(kind==='board')log.board=true;
 // Aggregate neighbouring capsules/contact iterations and suppress low-energy chatter.
 if(strength<EVENT_LIMITS.impactMinSpeed||time-(log.impactAt[kind]??-Infinity)<EVENT_LIMITS.contactGapMs)return;
 log.impactAt[kind]=time;emitGameEvent(s,kind,position,strength);
}
