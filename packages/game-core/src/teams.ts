import {BODY} from './court';
import {bodyShapes,validBodyPosition,type XZ} from './bodies';
import type {ScreenState} from './screen';
export type TeamId='A'|'B';
export const isTeamId=(value:unknown):value is TeamId=>value==='A'||value==='B';
export const TEAM={capacity:2,changeCooldownMs:750,colors:{A:'blue',B:'orange'}} as const;
export function balancedTeam(players:Iterable<{teamId?:TeamId}>):TeamId{const counts={A:0,B:0};for(const p of players)if(p.teamId)counts[p.teamId]++;return counts.A<=counts.B?'A':'B';}
export function teamSpawn(team:TeamId,players:Iterable<{id:string;position:XZ;screen:ScreenState}>):XZ|undefined{
 const bodies=[...players].flatMap(p=>bodyShapes(p.id,p.position,p.screen));
 const candidates:XZ[]=(team==='A'?[-2.1,-3.6]:[2.1,3.6]).flatMap(x=>[-1.8,1.2,-4].map(z=>({x,z})));
 // Bounded fallback: never push existing actors to make room.
 for(let z=BODY.bounds.minZ+.5;z<BODY.bounds.maxZ;z+=BODY.radius*2+.1)for(let x=BODY.bounds.minX+.5;x<BODY.bounds.maxX;x+=BODY.radius*2+.1)candidates.push({x,z});
 return candidates.find(p=>validBodyPosition(p,bodies));
}
