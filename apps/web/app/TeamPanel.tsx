'use client';
import {useEffect,useState} from 'react';
import type {OnlineSession} from '../game/onlineClient';
import type {Snapshot} from '../game/createGame';
import {TEAM,type TeamId} from '../../../packages/game-core/src/teams';
import {playerPalette} from '../../../packages/protocol/src/playerColor';
const errors:Record<string,string>={TEAM_LOCKED:'대기 상태에서만 팀을 변경할 수 있습니다.',TEAM_FULL:'선택한 팀이 가득 찼습니다.',TEAM_COOLDOWN:'잠시 후 다시 팀을 변경해주세요.',INVALID_TEAM:'올바른 팀을 선택해주세요.',NO_SAFE_SPAWN:'안전한 자리가 없습니다. 잠시 후 다시 시도해주세요.'};
export default function TeamPanel({state,session,compact=false}:{state:NonNullable<Snapshot['online']>;session:OnlineSession;compact?:boolean}){
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(compact)return;const offError=session.room.onMessage('teamError',(value:{code:string})=>{setPending(false);setError(errors[value.code]??'팀 변경에 실패했습니다.');});const offDone=session.room.onMessage('teamChanged',()=>{setPending(false);setError('');});return()=>{offError();offDone();};},[session,compact]);
 useEffect(()=>{if(!pending)return;const timer=setTimeout(()=>{setPending(false);setError('응답을 확인하지 못했습니다. 현재 팀을 확인하고 다시 시도해주세요.');},5000);return()=>clearTimeout(timer);},[pending]);
 const self=state.players.find(p=>p.id===state.selfId);
 return <section className={compact?'team-hud online-scoreboard':'team-panel'} aria-label={state.mode==='teamDuel'?'2대2 경기 팀':'2대2 연습 팀'}>
  {!compact&&<><h3>{state.mode==='teamDuel'?'2대2 경기 · 팀 합산 11점 선승':'2대2 연습 · 최대 4명 · 정식 승패 없음'}</h3><p>현재 내 팀: {self?.teamId??'배정 중'} · {state.mode==='teamDuel'?'팀별 두 명, 전원 준비가 필요합니다.':'두 명이나 세 명이어도 바로 연습할 수 있습니다.'}</p></>}
  <div className="team-columns">{(['A','B'] as TeamId[]).map(team=>{const players=state.players.filter(p=>p.teamId===team),tint=playerPalette(TEAM.colors[team]).ui;return <div className="team-column" key={team} style={{borderColor:tint}}><strong style={{color:tint}}>팀 {team} · {players.length}/2</strong><ul>{players.map(player=><li key={player.id} data-player-id={player.id}><span>{player.nickname||'플레이어'} {player.id===state.selfId?'(YOU)':''} {state.ownerId===player.id?'🏀':''}</span><b className="player-score" title="개인 연습 점수">{player.score}</b></li>)}{Array.from({length:2-players.length},(_,i)=><li key={'empty'+i} className="team-empty">빈자리</li>)}</ul>{!compact&&<button className="menu-secondary" disabled={!state.connected||pending||!!state.match&&state.match.stage!=='WAITING'||self?.teamId===team||players.length>=2} onClick={()=>{setError('');setPending(true);session.setTeam(team);}}>{self?.teamId===team?'현재 내 팀':`팀 ${team}로 이동`}</button>}</div>;})}</div>
  {!compact&&<><small>팀 색상은 이 연습 방에서만 적용됩니다. 개인 색상 설정은 유지됩니다. 점수는 개인 연습 기록입니다.</small>{error&&<p role="alert" className="menu-error">{error}</p>}</>}
 </section>;
}
