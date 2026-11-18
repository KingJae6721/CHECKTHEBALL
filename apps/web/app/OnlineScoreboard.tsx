import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {playerPalette} from '../../../packages/protocol/src/playerColor';
import {scoreboardSides,scoredPlayers,type ScorePlayer} from '../game/scoreboard';
export default function OnlineScoreboard({players,selfId,ownerId}:{players:ScorePlayer[];selfId:string;ownerId:string|null}){
 const {self,opponent}=scoreboardSides(players,selfId),previous=useRef(players);
 const [highlight,setHighlight]=useState<string[]>([]);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const signature=players.map(p=>`${p.id}:${p.score}`).join('|');
 useEffect(()=>{const scored=scoredPlayers(previous.current,players);previous.current=players;
  if(!scored.length)return;setHighlight(scored);clearTimeout(timer.current);timer.current=setTimeout(()=>setHighlight([]),650);
 },[signature]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <section className="online-scoreboard" aria-label="온라인 플레이어 점수">
  {[{player:self,label:'나',local:true},{player:opponent,label:'상대',local:false}].map(({player,label,local})=>{const color=player?playerPalette(player.color).ui:'#a9b6b5';return <div key={label} data-player-id={player?.id} style={{'--player-color':color,'--player-soft':color+'30','--player-glow':color+'70'} as CSSProperties} className={`score-side ${local?'self':'opponent'} ${player&&highlight.includes(player.id)?'scored':''}`}>
   <div className="score-name"><i className="player-color-dot" aria-hidden="true"/><span>{player?.nickname?.trim()||label}</span>{local?<b>YOU</b>:<b>상대</b>}</div>
   <strong className="player-score">{player?.score??0}</strong>
   <small>{!player?(local?'연결 중':'상대 대기 중'):ownerId===player.id?'● 공 소유':local?'내 점수':'상대 점수'}</small>
  </div>;})}
 </section>;
}
