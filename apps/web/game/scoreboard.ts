export type ScorePlayer={id:string;nickname?:string;score:number};
export function scoreboardSides(players:ScorePlayer[],selfId:string){
 return {self:players.find(p=>p.id===selfId),opponent:players.find(p=>p.id!==selfId)};
}
export function scoredPlayers(previous:ScorePlayer[],current:ScorePlayer[]){
 return current.filter(p=>{const old=previous.find(q=>q.id===p.id);return old!==undefined&&p.score>old.score;}).map(p=>p.id);
}
