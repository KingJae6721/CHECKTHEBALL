export type RoomMode='practice'|'duel';
export type MatchStage='WAITING'|'COUNTDOWN'|'PLAYING'|'FINISHED'|'ABORTED';
export type MatchIntent={matchId:number;intent:'ready'|'unready'|'rematch'};
export type MatchResult={players:{id:string;nickname:string;score:number}[];winnerId:string|null;reason:'TARGET_SCORE'|'OPPONENT_LEFT'};
export type MatchState={id:number;epoch:number;stage:MatchStage;ready:Record<string,boolean>;rematch:Record<string,boolean>;scores:Record<string,number>;firstAttacker:string|null;attackId:string|null;needsClear:boolean;countdownEnd:number|null;setupEnd:number|null;result:MatchResult|null};
export const MATCH={target:11,countdownMs:3000,setupMs:1000};
export const createMatch=(id=1,epoch=0):MatchState=>({id,epoch,stage:'WAITING',ready:{},rematch:{},scores:{},firstAttacker:null,attackId:null,needsClear:false,countdownEnd:null,setupEnd:null,result:null});
export const matchPlayable=(m:MatchState|null|undefined)=>!m||m.stage==='PLAYING'&&m.setupEnd===null;
export function validMatchIntent(v:unknown):v is MatchIntent{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const m=v as MatchIntent;return Object.keys(m).every(k=>k==='matchId'||k==='intent')&&Number.isSafeInteger(m.matchId)&&m.matchId>0&&['ready','unready','rematch'].includes(m.intent);
}
