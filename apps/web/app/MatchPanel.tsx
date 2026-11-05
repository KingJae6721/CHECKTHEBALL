import type {MatchState,MatchIntent} from '../../../packages/game-core/src/match';
import RoomInvite from './RoomInvite';
type Player={id:string;nickname?:string;score:number};
export default function MatchPanel({match:m,roomCode,players,selfId,remainingMs,locked,connected,onIntent,onEnter,onLeave,onSettings,onHelp,error}:{match:MatchState;roomCode:string;players:Player[];selfId:string;remainingMs:number;locked:boolean;connected:boolean;onIntent:(intent:MatchIntent['intent'])=>void;onEnter:()=>void;onLeave:()=>void;onSettings?:()=>void;onHelp?:()=>void;error?:string}){
 const opponent=players.find(p=>p.id!==selfId),finished=m.stage==='FINISHED',aborted=m.stage==='ABORTED';
 const name=(id:string|null)=>players.find(p=>p.id===id)?.nickname||(id===selfId?'나':'상대');
 const seconds=Math.max(0,Math.ceil(remainingMs/1000));
 const title=aborted?'경기 중단':finished?(m.result?.winnerId===selfId?'승리':'패배'):m.stage==='WAITING'?'1대1 경기 준비':m.stage==='COUNTDOWN'?`경기 시작 ${seconds}`:'1대1 경기';
 const turn=m.setupEnd!==null?`다음 공격 준비 ${seconds}`:m.needsClear?`${name(m.attackId)} · 외곽선 밖으로 클리어 필요`:`${name(m.attackId)} 공격`;
 return <>
  {m.stage==='PLAYING'&&<div className="match-notice" role="status">{turn}</div>}
  {(m.stage!=='PLAYING'||!locked)&&<div className="match-layer" onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}><section className="match-card" aria-label="1대1 경기">
   <h2 tabIndex={-1} data-menu-title>{title}</h2>
   {m.stage==='WAITING'&&<><RoomInvite code={roomCode}/><p>11점 선승 · 2점/3점 · 득점 후 공격 교대</p><p>수비에서 공을 얻으면 외곽선 밖으로 클리어하세요.</p></>}
   {(finished||aborted)&&m.result?<><p>{aborted?'상대가 나가 경기가 중단되었습니다.':'경기가 종료되었습니다.'}</p>
    <div className="match-results">{[...m.result.players].sort((a,b)=>Number(b.id===selfId)-Number(a.id===selfId)).map(p=><div key={p.id}><span>{p.nickname} {p.id===selfId?'(나)':''}</span><strong>{p.score}</strong>{m.result!.winnerId===p.id&&<b>승자</b>}</div>)}</div></>:
    <div className="match-participants">{[players.find(p=>p.id===selfId),opponent].map((p,i)=><p key={i}>{p?.nickname||(i===0?'나':'상대 대기 중')} {i===0&&'(나)'} <strong>{p?(m.stage==='COUNTDOWN'?'시작 대기':m.ready[p.id]?'준비 완료':'준비 전'):''}</strong></p>)}</div>}
   {!connected&&<p role="alert">연결이 끊겼습니다. 나간 후 다시 입장하세요.</p>}
   {(m.stage==='WAITING'||m.stage==='COUNTDOWN')&&<button disabled={!connected} onClick={()=>onIntent(m.stage==='COUNTDOWN'||m.ready[selfId]?'unready':'ready')}>{m.stage==='COUNTDOWN'||m.ready[selfId]?'준비 취소':'준비'}</button>}
   {m.stage==='COUNTDOWN'&&<p>모두 준비됐습니다. 카운트다운 후 입장 버튼을 눌러주세요.</p>}
   {m.stage==='PLAYING'&&<><p>{turn}</p><button disabled={!connected||m.setupEnd!==null} onClick={onEnter}>경기 입장 / 계속하기</button><small>클릭하면 마우스가 잠깁니다. Esc로 메뉴를 엽니다.</small></>}
   {finished&&<><button disabled={!connected||!opponent||!!m.rematch[selfId]} onClick={()=>onIntent('rematch')}>{m.rematch[selfId]?'상대 재경기 동의 대기':'재경기 동의'}</button><p>{!opponent?'상대가 나가 재경기를 할 수 없습니다.':m.rematch[opponent.id]?'상대 재경기 동의 완료':'상대 재경기 동의 전'}</p></>}
   {m.stage==='PLAYING'&&!locked&&<p>메뉴를 열어도 온라인 경기는 계속됩니다.</p>}
   {onSettings&&<button className="match-leave" onClick={onSettings}>설정</button>}
   {onHelp&&<button className="match-leave" onClick={onHelp}>조작 안내</button>}
   {error&&<p role="alert">{error}</p>}
   <button className="match-leave" onClick={onLeave}>첫 화면으로 나가기</button>
  </section></div>}
 </>;
}
