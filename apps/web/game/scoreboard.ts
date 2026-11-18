import type {PlayerColor} from '../../../packages/protocol/src/playerColor';
export type ScorePlayer={id:string;color?:PlayerColor;nickname?:string;score:number};
export function scoreboardSides(players:ScorePlayer[],selfId:string){
 return {self:players.find(p=>p.id===selfId),opponent:players.find(p=>p.id!==selfId)};
}
export function scoredPlayers(previous:ScorePlayer[],current:ScorePlayer[]){
 return current.filter(p=>{const old=previous.find(q=>q.id===p.id);return old!==undefined&&p.score>old.score;}).map(p=>p.id);
}
// Authority score deltas only. Joining an existing game, resets and aggregated
// catch-up snapshots must not invent a new single-basket announcement.
export function scoreGains(previous:ScorePlayer[],current:ScorePlayer[]){
 return current.flatMap(player=>{const old=previous.find(p=>p.id===player.id);if(!old)return [];const points=player.score-old.score;return Number.isInteger(points)&&points>0&&points<=3?[{id:player.id,points}]:[];});
}
