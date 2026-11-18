'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {RoomDirectory} from '../game/roomDirectory';
import {roomName,type RoomCreation} from '../../../packages/protocol/src/rooms';
import type {RoomMode} from '../../../packages/game-core/src/match';
export type OnlinePage='MENU'|'LIST'|'CREATE'|'CODE';
export default function OnlineMenu({page,onPage,nickname,roomId,onRoomId,mode,onMode,connecting,ready,refreshKey,onCreate,onJoin,onBack}:{page:OnlinePage;onPage:(page:OnlinePage)=>void;nickname:string;roomId:string;onRoomId:(id:string)=>void;mode:RoomMode;onMode:(mode:RoomMode)=>void;connecting:boolean;ready:boolean;refreshKey:number;onCreate:(options:RoomCreation)=>void;onJoin:(id:string)=>void;onBack:()=>void}){
 const [directory]=useState(()=>new RoomDirectory()),list=useSyncExternalStore(directory.subscribe,directory.getSnapshot,directory.getSnapshot);
 const [name,setName]=useState(''),[privateRoom,setPrivateRoom]=useState(false),[validation,setValidation]=useState('');
 useEffect(()=>{if(page==='LIST'&&!connecting)void directory.refresh();return()=>directory.cancel();},[directory,page,connecting,refreshKey]);
 const navigate=(next:OnlinePage)=>{setValidation('');onPage(next);};
 const disabled=connecting||!ready;
 return <>
  <h2 tabIndex={-1} data-menu-title>{page==='LIST'?'방 찾기':page==='CREATE'?'방 만들기':page==='CODE'?'코드로 참가':'온라인 플레이'}</h2>
  {page==='MENU'?<><p>플레이어 · {nickname}</p><button className="menu-primary" onClick={()=>navigate('LIST')}>방 찾기</button><button className="menu-secondary" onClick={()=>navigate('CREATE')}>방 만들기</button><button className="menu-secondary" onClick={()=>navigate('CODE')}>코드로 참가</button></>:null}
  {page==='CREATE'&&<><label className="menu-field">방 이름<input aria-label="방 이름" disabled={connecting} value={name} placeholder={`${nickname}의 코트`} onChange={e=>{setName(e.target.value);setValidation('');}}/></label><small>{Array.from(name).length}/30자 · 비워두면 닉네임으로 제안합니다.</small><label className="menu-field">경기 모드<select aria-label="방 모드" value={mode} disabled={connecting} onChange={e=>onMode(e.target.value as RoomMode)}><option value="duel">1대1 경기 · 11점 선승</option><option value="practice">자유 연습</option></select></label><label className="room-privacy">공개 설정<select aria-label="공개 설정" disabled={connecting} value={privateRoom?'private':'public'} onChange={e=>setPrivateRoom(e.target.value==='private')}><option value="public">공개 · 방 목록에 표시</option><option value="private">비공개 · 코드로 참가</option></select></label><small>비공개는 목록에서만 숨깁니다. 코드를 아는 사람은 참가할 수 있습니다.</small><button className="menu-primary" disabled={disabled} onClick={()=>{const validated=roomName(name,nickname);if(validated.error){setValidation(validated.error);return;}onCreate({roomName:validated.name,mode,isPrivate:privateRoom});}}>방 생성</button></>}
  {page==='CODE'&&<><label className="menu-field">Room ID<input aria-label="Room ID" maxLength={64} value={roomId} disabled={connecting} onChange={e=>onRoomId(e.target.value)} autoComplete="off"/></label><button className="menu-primary" disabled={disabled} onClick={()=>onJoin(roomId)}>Room ID로 참가</button></>}
  {page==='LIST'&&<><div className="room-list-tools"><button className="menu-secondary" disabled={connecting||list.loading} onClick={()=>void directory.refresh()}>새로고침</button><button className="menu-secondary" disabled={connecting} onClick={()=>navigate('CREATE')}>방 만들기</button></div><p className="room-list-time">{list.fetchedAt===null?'아직 조회하지 않았습니다.':`최근 조회 ${new Date(list.fetchedAt).toLocaleTimeString('ko-KR')} · 참가 시 상태가 달라질 수 있습니다.`}</p>
   {list.loading&&<p role="status">방 목록을 불러오는 중입니다…</p>}
   {list.error&&<p className="menu-error" role="alert">{list.error}{list.fetchedAt!==null&&' 이전 조회 결과입니다.'}<button disabled={connecting||list.loading} onClick={()=>void directory.refresh()}>다시 조회</button></p>}
   {!list.loading&&!list.error&&list.rooms.length===0&&<p role="status">참가 가능한 방이 없습니다.</p>}
   <ul className="public-room-list" aria-label="공개 방 목록" aria-busy={list.loading}>{list.rooms.map(room=><li key={room.roomId}><div><strong>{room.roomName}</strong><small>{room.mode==='duel'?'1대1 경기':'자유 연습'} · {room.players}/{room.maxPlayers} · 상대 대기</small></div><button className="menu-secondary" aria-label={`${room.roomName} 참가`} disabled={disabled||list.loading} onClick={()=>onJoin(room.roomId)}>참가</button></li>)}</ul>
  </>}
  {validation&&<p className="menu-error" role="alert">{validation}</p>}
  {connecting&&<p role="status">서버에 연결 중입니다…</p>}
  <button className="menu-text" onClick={connecting?onBack:page==='MENU'?onBack:()=>navigate('MENU')}>{connecting?'연결 취소 · 뒤로':'뒤로'}</button>
 </>;
}
