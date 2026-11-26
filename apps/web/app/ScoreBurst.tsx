'use client';
import {useEffect,useRef} from 'react';
import {scoreGains,type ScorePlayer} from '../game/scoreboard';
import type {Snapshot} from '../game/createGame';
import {DEFAULT_PLAYER_COLOR,playerPalette,type PlayerColor} from '../../../packages/protocol/src/playerColor';
export const SCORE_BURST={durationMs:1150,reducedMotionMs:220,maxVisible:4} as const;
export default function ScoreBurst({state,color=DEFAULT_PLAYER_COLOR}:{state:Snapshot;color?:PlayerColor}){
 const layer=useRef<HTMLDivElement>(null),previous=useRef<{scope:string;players:ScorePlayer[]}|null>(null),active=useRef(new Map<HTMLElement,Animation>()),skipNext=useRef(false);
 const scope=state.online?`${state.online.roomId}:${state.online.match?.id??'practice'}`:'offline';
 const players:ScorePlayer[]=state.online?.players??[{id:'offline',score:state.score}];
 const signature=players.map(p=>`${p.id}:${p.score}`).join('|');
 const clear=()=>{for(const [node,animation] of active.current){animation.cancel();node.remove();}active.current.clear();};
 useEffect(()=>{
  const old=previous.current;previous.current={scope,players};
  if(!old||old.scope!==scope){clear();return;}
  if(document.hidden||skipNext.current){skipNext.current=false;return;}
  const container=layer.current;if(!container)return;
  for(const gain of scoreGains(old.players,players)){
   const scorerTeam=state.online?.players.find(p=>p.id===gain.id)?.teamId;
   const target=state.online?.match?.teams&&scorerTeam?document.querySelector(`[data-team-id="${scorerTeam}"] .player-score`):state.online?[...document.querySelectorAll<HTMLElement>('.online-scoreboard [data-player-id]')].find(side=>side.dataset.playerId===gain.id)?.querySelector('.player-score'):document.querySelector('.session .score strong');
   if(!target)continue;
   const bounds=target.getBoundingClientRect(),area=container.getBoundingClientRect();if(!bounds.width||!bounds.height)continue;
   const dx=bounds.left+bounds.width/2-(area.left+area.width/2),dy=bounds.top+bounds.height/2-(area.top+area.height/2);
   const node=document.createElement('span');node.className=`score-burst ${state.online&&gain.id!==state.online.selfId?'opponent':'self'}`;node.textContent=`+${gain.points}`;container.appendChild(node);
   const tint=playerPalette(state.online?players.find(p=>p.id===gain.id)?.color:color).ui;node.style.color=tint;node.style.textShadow=`0 3px 3px #091c24,0 0 24px ${tint}66`;
   if(typeof node.animate!=='function'){node.remove();continue;}
   const center='translate(-50%,-50%)',destination=`${center} translate(${dx}px,${dy}px) scale(.15)`;
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const animation=node.animate(reduced?[
    {opacity:1,transform:center},{opacity:0,transform:center}
   ]:[
    {opacity:0,transform:`${center} scale(.65)`,offset:0},
    {opacity:1,transform:`${center} scale(1.18)`,offset:.13},
    {opacity:1,transform:`${center} scale(1)`,offset:.27},
    {opacity:1,transform:`${center} scale(1)`,offset:.42,easing:'cubic-bezier(.65,0,.85,.3)'},
    {opacity:0,transform:destination,offset:1}
   ],{duration:reduced?SCORE_BURST.reducedMotionMs:SCORE_BURST.durationMs,easing:'ease-out',fill:'forwards'});
   active.current.set(node,animation);
   while(active.current.size>SCORE_BURST.maxVisible){const [oldNode,oldAnimation]=active.current.entries().next().value!;oldAnimation.cancel();oldNode.remove();active.current.delete(oldNode);}
   void animation.finished.catch(()=>{}).then(()=>{active.current.delete(node);node.remove();});
  }
 },[scope,signature]);
 useEffect(()=>{const visibility=()=>{if(document.hidden){skipNext.current=true;clear();}};document.addEventListener('visibilitychange',visibility);return()=>{document.removeEventListener('visibilitychange',visibility);clear();};},[]);
 return <div ref={layer} className="score-burst-layer" aria-hidden="true"/>;
}
