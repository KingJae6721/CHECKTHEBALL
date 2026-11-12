'use client';
import {useEffect,useRef,useState} from 'react';
import RoomChat from './RoomChat';
import MatchPanel from './MatchPanel';import GameHud from './GameHud';import RoomInvite from './RoomInvite';import {Settings,Help,Credits} from './MenuPanels';
import type {OnlineSession} from '../game/onlineClient';import type {Snapshot,createGame} from '../game/createGame';
import {BackgroundMusic} from '../game/backgroundMusic';
import {AUDIO_STORAGE_KEY,parseAudioSettings,type AudioSettings} from '../game/audioConfig';
import {CAMERA_KEY,NICKNAME_KEY,loadPreferences,savePreference,roomIdError,connectionError,ConnectionAttempt,type Store,type MenuScreen} from '../game/menuState';
import {validateNickname,NICKNAME_MAX} from '../../../packages/protocol/src/nickname';
import {HEAD_BOB} from '../../../packages/game-core/src/court';import {createDefense} from '../../../packages/game-core/src/defense';import {createPractice,type PracticeMode} from '../../../packages/game-core/src/practice';import type {RoomMode} from '../../../packages/game-core/src/match';
const scenarios:Record<PracticeMode,{name:string;description:string}>={PASS:{name:'패스 연습',description:'더미에게 패스하고 돌아오는 공을 받습니다.'},STEAL:{name:'스틸 연습',description:'더미의 공을 좌클로 스틸합니다.'},BLOCK:{name:'블록 연습',description:'슛 예고에 맞춰 우클 블록을 해봅니다.'},ATTACK:{name:'공격 연습',description:'드리블·슛·점프·크로스오버를 연습합니다.'},SCREEN:{name:'몸 충돌 · 정면과 점프',description:'고정 스크린을 정면과 옆에서 통과해봅니다.'},GAP:{name:'몸 충돌 · 좁은 틈',description:'두 스크리너 사이와 옆으로 이동합니다.'},EDGE:{name:'몸 충돌 · 코트 경계',description:'경계 근처 스크린과 슬라이딩을 확인합니다.'}};
const initial:Snapshot={defense:createDefense(),practice:createPractice(),passCharge:0,owner:'player',flightKind:null,aimingDummy:false,score:0,attempts:0,made:0,phase:'HELD',charge:0,message:'',lastTiming:null,distance:7.2,locked:false};
function storage():Store|undefined{try{return window.localStorage;}catch{return undefined;}}
export default function Game(){
 const canvas=useRef<HTMLCanvasElement>(null),runtime=useRef<ReturnType<typeof createGame>|null>(null),factory=useRef<typeof createGame|null>(null),sessionRef=useRef<OnlineSession|undefined>(undefined),gate=useRef(new ConnectionAttempt()),generation=useRef(0);
 const [chatOpen,setChatOpen]=useState(false);
 const [screen,setScreen]=useState<MenuScreen>('HOME'),[panel,setPanel]=useState<'MAIN'|'SETTINGS'|'HELP'|'CREDITS'>('MAIN');
 const [state,setState]=useState(initial),[session,setSession]=useState<OnlineSession>(),[factoryReady,setFactoryReady]=useState(false),[sceneReady,setSceneReady]=useState(false),[hasPlayed,setHasPlayed]=useState(false);
 const [nickname,setNickname]=useState(''),[nicknameError,setNicknameError]=useState(''),[profileReady,setProfileReady]=useState(false),[roomId,setRoomId]=useState(''),[roomMode,setRoomMode]=useState<RoomMode>('duel'),[scenario,setScenario]=useState<PracticeMode>('PASS'),[error,setError]=useState('');
 const [audio,setAudio]=useState<AudioSettings>(()=>parseAudioSettings(null)),[camera,setCamera]=useState(HEAD_BOB.enabled);const prefs=useRef({audio:parseAudioSettings(null),camera:HEAD_BOB.enabled});
 const music=useRef<BackgroundMusic|null>(null);
 useEffect(()=>{const bgm=new BackgroundMusic();music.current=bgm;bgm.setSettings(prefs.current.audio);bgm.setHidden(document.hidden);const visibility=()=>bgm.setHidden(document.hidden);document.addEventListener('visibilitychange',visibility);return()=>{document.removeEventListener('visibilitychange',visibility);bgm.dispose();if(music.current===bgm)music.current=null;};},[]);
 useEffect(()=>{music.current?.setPlayingMatch(screen==='PLAYING'&&state.online?.match?.stage==='PLAYING');},[screen,state.online?.match?.stage]);
 useEffect(()=>{
  if(!profileReady)return;
  const remove=()=>{document.removeEventListener('click',activate);document.removeEventListener('keydown',activate);};
  const activate=(event:MouseEvent|KeyboardEvent)=>{
   if(!event.isTrusted)return;
   if(event instanceof KeyboardEvent&&(event.repeat||event.ctrlKey||event.metaKey||event.altKey||['Escape','Shift','Control','Alt','Meta'].includes(event.key)))return;
   remove();void music.current?.activate();
  };
  // Bubble after UI handlers so a first click on mute/disable still respects that choice.
  document.addEventListener('click',activate);document.addEventListener('keydown',activate);
  return remove;
 },[profileReady]);
 const playing=screen==='PLAYING',connecting=screen==='CONNECTING';
 useEffect(()=>{const p=loadPreferences(storage(),'게스트'+Math.floor(1000+Math.random()*9000));setNickname(p.nickname);setAudio(p.audio);setCamera(p.camera);prefs.current={audio:p.audio,camera:p.camera};music.current?.setSettings(p.audio);setProfileReady(true);},[]);
 useEffect(()=>{let cancelled=false;import('../game/createGame').then(m=>{if(!cancelled){factory.current=m.createGame;setFactoryReady(true);}}).catch(()=>{if(!cancelled)setError('게임 파일을 불러오지 못했습니다. 새로고침해주세요.');});return()=>{cancelled=true;};},[]);
 useEffect(()=>()=>{gate.current.cancel();generation.current++;runtime.current?.dispose();runtime.current=null;sessionRef.current?.close();sessionRef.current=undefined;},[]);
 useEffect(()=>{if(chatOpen||playing&&state.locked)return;const id=requestAnimationFrame(()=>document.querySelector<HTMLElement>('[data-menu-title]')?.focus());return()=>cancelAnimationFrame(id);},[screen,panel,state.locked,chatOpen]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.code==='Escape'&&!document.pointerLockElement&&panel!=='MAIN'){setPanel('MAIN');e.preventDefault();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[panel]);
 function saveName(){const v=validateNickname(nickname);setNicknameError(v.error??'');if(v.error)return false;setNickname(v.name);savePreference(storage(),NICKNAME_KEY,v.name);return true;}
 function changeAudio(next:AudioSettings){prefs.current.audio=next;setAudio(next);savePreference(storage(),AUDIO_STORAGE_KEY,JSON.stringify(next));runtime.current?.setAudio(next);music.current?.setSettings(next);void music.current?.activate();}
 function changeCamera(next:boolean){prefs.current.camera=next;setCamera(next);savePreference(storage(),CAMERA_KEY,String(next));runtime.current?.setCameraMotion(next);}
 function openPanel(next:typeof panel){if(connecting){gate.current.cancel();setScreen('FRIENDS');}runtime.current?.pause();setPanel(next);}
 function home(){setChatOpen(false);gate.current.cancel();generation.current++;runtime.current?.dispose();runtime.current=null;sessionRef.current?.close();sessionRef.current=undefined;setSession(undefined);setSceneReady(false);setState(initial);setHasPlayed(false);setError('');setPanel('MAIN');setScreen('HOME');}
 function navigate(next:'FRIENDS'|'PRACTICE_SELECT'){if(!saveName())return;void music.current?.activate();setError('');setPanel('MAIN');setScreen(next);}
 function enter(){void music.current?.activate();setError('');setPanel('MAIN');void runtime.current?.start();}
 function launch(online?:OnlineSession,autoStart=false){
  if(autoStart)void music.current?.activate();
  if(runtime.current)return false;
  if(!factory.current||!canvas.current){setError('코트를 준비 중입니다. 잠시 후 다시 눌러주세요.');return false;}
  const id=++generation.current;setState(initial);setHasPlayed(false);setError('');canvas.current.hidden=false;
  try{const rt=factory.current(canvas.current,s=>{if(id===generation.current){setState(s);if(s.locked)setHasPlayed(true);}},e=>{if(id===generation.current)setError(e);},online);runtime.current=rt;rt.setAudio(prefs.current.audio);rt.setCameraMotion(prefs.current.camera);if(!online)rt.scenario(scenario);setSceneReady(true);setPanel('MAIN');setScreen('PLAYING');if(autoStart)void rt.start();return true;}
  catch{generation.current++;runtime.current?.dispose();runtime.current=null;canvas.current.hidden=true;setError('코트를 열지 못했습니다. 하드웨어 가속과 WebGL 지원을 확인해주세요.');return false;}
 }
 async function join(create:boolean){
  if(!saveName())return;void music.current?.activate();if(!create){const invalid=roomIdError(roomId);if(invalid){setError(invalid);return;}}
  const token=gate.current.begin();if(token===null)return;setError('');setScreen('CONNECTING');
  try{const {connectOnline}=await import('../game/onlineClient');if(!gate.current.current(token))return;const connected=await connectOnline(create?undefined:roomId.trim(),validateNickname(nickname).name,roomMode);
   if(!gate.current.accept(token,connected))return;
   if(!factory.current){connected.close();setScreen('FRIENDS');setError('코트를 준비 중입니다. 다시 눌러주세요.');return;}
   sessionRef.current=connected;setSession(connected);setRoomId(connected.room.roomId);
   if(!launch(connected)){connected.close();sessionRef.current=undefined;setSession(undefined);setScreen('FRIENDS');}
  }catch(e){if(gate.current.current(token)){setError(connectionError(e));setScreen('FRIENDS');}}finally{gate.current.finish(token);}
 }
 function back(){gate.current.cancel();setError('');setScreen(connecting?'FRIENDS':'HOME');setPanel('MAIN');}
 function chooseScenario(next:PracticeMode){setScenario(next);if(playing&&!session)runtime.current?.scenario(next);}
 const ping=state.online?.pingMs,pingQuality=ping==null?'unknown':ping<=100?'good':ping<=200?'fair':'poor';
 const showCard=!chatOpen&&(!playing||!state.locked&&(!state.online?.match||panel!=='MAIN'));
 const chooser=<fieldset className="scenario-choices"><legend>연습 선택</legend>{Object.entries(scenarios).map(([id,item])=><label key={id}><input type="radio" name="scenario" value={id} checked={scenario===id} onChange={()=>chooseScenario(id as PracticeMode)}/><span><strong>{item.name}</strong><small>{item.description}</small></span></label>)}</fieldset>;
 return <main className={`game ${!playing||!state.locked?'menu-shell':''}`} onKeyDownCapture={e=>{if(e.code!=='Escape'&&(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)&&!(e.target as HTMLElement).closest('.room-chat'))e.stopPropagation();}}>
  <canvas ref={canvas} hidden={!playing} aria-label="농구 코트"/>
  {!playing&&<div className="home-backdrop" aria-hidden="true"><svg viewBox="0 0 760 800"><path d="M35 765V40H725V765ZM35 445H725M270 40V280H490V40M270 280A110 110 0 0 0 490 280M70 40V115A310 310 0 0 0 690 115V40"/><circle cx="380" cy="95" r="18"/><path className="home-rim" d="M340 65H420M362 95H398"/></svg></div>}
  <div className="vignette"/>
  <header className="topbar"><button className="brand brand-button" onClick={home} aria-label="CheckTheBall 첫 화면">◉ CheckTheBall<span className="brand-slash">/</span></button><div className="top-right">
   {playing&&state.online&&<span className={`network-ping ${pingQuality}`} title={state.online.pingStatus} aria-label={ping==null?state.online.pingStatus:`핑 ${ping}ms`}>{ping??'--'}<small>ms</small></span>}
   <button className="menu-utility" onClick={()=>openPanel('SETTINGS')}>설정</button><button className="menu-utility" onClick={()=>openPanel('HELP')}>조작 안내</button>
  </div></header>
  {playing&&(state.locked||chatOpen)&&panel==='MAIN'&&<GameHud state={state} onReset={()=>runtime.current?.reset()}/>}
  {showCard&&<div className="menu-layer"><section className="menu-card" aria-label={panel==='SETTINGS'?'설정':panel==='HELP'?'조작 안내':panel==='CREDITS'?'크레딧':'시작 메뉴'}>
   {panel==='SETTINGS'?<Settings onMusic={()=>void music.current?.activate()} audio={audio} camera={camera} onAudio={changeAudio} onCamera={changeCamera} onBack={()=>setPanel('MAIN')}/>:
    panel==='HELP'?<Help online={!!session} onBack={()=>setPanel('MAIN')}/>:
    panel==='CREDITS'?<Credits onBack={()=>setPanel('MAIN')}/>:
    screen==='HOME'?<><span className="eyebrow">PICK UP. PLAY.</span><h1 tabIndex={-1} data-menu-title>내 코트, 내 리듬.</h1><p>친구와 한 판, 혼자서 한 번 더.<br/>가볍게 시작하는 1인칭 농구.</p>
     <label className="nickname-field">게스트 닉네임<input aria-label="게스트 닉네임" aria-describedby="nickname-note nickname-error" aria-invalid={!!nicknameError} value={nickname} maxLength={NICKNAME_MAX} onChange={e=>{setNickname(e.target.value);setNicknameError('');}} onBlur={()=>{if(profileReady)saveName();}} autoComplete="nickname"/></label>
     <small id="nickname-note">1~20자 · 표시 이름이며 로그인 없이 플레이합니다.</small><p id="nickname-error" className="menu-error" role={nicknameError?'alert':undefined}>{nicknameError}</p>
     <button className="menu-primary" disabled={!profileReady} onClick={()=>navigate('FRIENDS')}>친구와 플레이</button><button className="menu-secondary" disabled={!profileReady} onClick={()=>navigate('PRACTICE_SELECT')}>혼자 연습</button><button className="menu-text" onClick={()=>setPanel('CREDITS')}>크레딧</button>
    </>:
    screen==='FRIENDS'||connecting?<><h2 tabIndex={-1} data-menu-title>친구와 플레이</h2><p>플레이어 · {nickname}</p><label className="menu-field">방 만들기 모드<select aria-label="방 모드" value={roomMode} disabled={connecting} onChange={e=>setRoomMode(e.target.value as RoomMode)}><option value="duel">1대1 경기 · 11점 선승</option><option value="practice">자유 연습</option></select></label>
     <button className="menu-primary" disabled={connecting||!factoryReady} onClick={()=>void join(true)}>방 만들기</button><label className="menu-field">친구의 Room ID<input aria-label="Room ID" maxLength={64} value={roomId} disabled={connecting} onChange={e=>setRoomId(e.target.value)} autoComplete="off"/></label><button className="menu-secondary" disabled={connecting||!factoryReady} onClick={()=>void join(false)}>Room ID로 참가</button>
     {connecting&&<p role="status">서버에 연결 중입니다…</p>}<button className="menu-text" onClick={back}>{connecting?'연결 취소 · 뒤로':'뒤로'}</button>
    </>:
    screen==='PRACTICE_SELECT'?<><h2 tabIndex={-1} data-menu-title>혼자 연습</h2>{chooser}<button className="menu-primary" disabled={!factoryReady} onClick={()=>launch(undefined,true)}>{factoryReady?'연습 시작':'코트 준비 중…'}</button><button className="menu-text" onClick={back}>뒤로</button></>:
    <><h2 tabIndex={-1} data-menu-title>{hasPlayed?'플레이 메뉴':'코트 준비 완료'}</h2>{session?<><RoomInvite code={session.room.roomId}/><p>{state.online?.connected===false?'연결이 끊겼습니다.':(state.online?.count??0)<2?'친구가 참가하기를 기다립니다.':'친구가 참가했습니다.'}</p><p>온라인에서는 메뉴를 열어도 경기가 계속됩니다.</p></>:chooser}
     <button className="menu-primary" disabled={!sceneReady||!!session&&!session.connected} onClick={enter}>{hasPlayed?'계속하기':'코트에서 플레이'}</button>{!session&&<button className="menu-secondary" onClick={()=>runtime.current?.reset()}>현재 연습 재시도</button>}
     <button className="menu-secondary" onClick={()=>setPanel('SETTINGS')}>설정</button><button className="menu-text" onClick={()=>setPanel('HELP')}>조작 안내</button><button className="menu-text" onClick={home}>첫 화면으로 나가기</button>
    </>}
   {error&&<p className="menu-error" role="alert">{error}</p>}<p className="desktop-note">데스크톱 키보드와 마우스로 플레이해주세요. 모바일 조작은 지원하지 않습니다.</p>
  </section></div>}
  {playing&&state.online?.match&&!chatOpen&&panel==='MAIN'&&<MatchPanel error={error} roomCode={state.online.roomId} match={state.online.match} players={state.online.players} selfId={state.online.selfId} remainingMs={state.online.remainingMs??0} locked={state.locked} connected={state.online.connected} onIntent={intent=>session?.matchIntent(intent)} onEnter={enter} onLeave={home} onSettings={()=>openPanel('SETTINGS')} onHelp={()=>openPanel('HELP')}/>}
  {playing&&session&&panel==='MAIN'&&<RoomChat key={session.room.sessionId} session={session} onBegin={()=>runtime.current?.pause('CHAT')} onOpenChange={setChatOpen} onClose={()=>{if(session.canPlay)enter();}}/>}
  {playing&&state.audioFailed&&!audio.muted&&audio.volume>0&&<button className="audio-recovery" onClick={()=>runtime.current?.unlockAudio()}>소리가 켜지지 않았습니다 · 눌러서 다시 켜기</button>}
 </main>;
}
