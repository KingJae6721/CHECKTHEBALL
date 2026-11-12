'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {OnlineSession} from '../game/onlineClient';
import {CHAT,chatText} from '../../../packages/protocol/src/chat';
export default function RoomChat({session,onBegin,onOpenChange,onClose}:{session:OnlineSession;onBegin:()=>void;onOpenChange:(open:boolean)=>void;onClose:()=>void}){
 const store=session.chat,snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false),[faded,setFaded]=useState(false);
 const input=useRef<HTMLInputElement>(null),log=useRef<HTMLDivElement>(null),isOpen=useRef(false),composing=useRef(false),sending=useRef(false),alive=useRef(true),atBottom=useRef(true),text=useRef('');
 const callbacks=useRef({onBegin,onOpenChange,onClose});callbacks.current={onBegin,onOpenChange,onClose};text.current=draft;
 function toggle(next:boolean){const wasOpen=isOpen.current;isOpen.current=next;setOpen(next);callbacks.current.onOpenChange(next);if(next){atBottom.current=true;callbacks.current.onBegin();}else{input.current?.blur();if(wasOpen)callbacks.current.onClose();}}
 async function send(){
  if(sending.current)return;const body=text.current;if(!body.trim()){toggle(false);return;}
  const validated=chatText(body);if(validated.error){setError(validated.error);return;}
  if(!store.getSnapshot().connected){setError('연결이 끊겨 전송할 수 없습니다.');return;}
  sending.current=true;setPending(true);setError('');
  const confirmation=store.send(body);
  // Request Pointer Lock inside the Enter/click gesture, not after an async ACK.
  toggle(false);
  try{await confirmation;if(alive.current&&text.current===body){text.current='';setDraft('');}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'전송하지 못했습니다.');}
  finally{sending.current=false;if(alive.current)setPending(false);}
 }
 const actions=useRef({toggle,send});actions.current={toggle,send};
 useEffect(()=>{
  alive.current=true;
  const key=(event:KeyboardEvent)=>{
   if(isOpen.current){
    event.stopImmediatePropagation();
    if(composing.current||event.isComposing||event.keyCode===229)return;
    if(event.code==='Escape'){event.preventDefault();if(!event.repeat)actions.current.toggle(false);}
    else if(event.code==='Enter'){event.preventDefault();if(!event.repeat)void actions.current.send();}
    return;
   }
   const target=event.target as HTMLElement|null;
   if(event.code!=='Enter'||event.repeat||event.isComposing||!document.pointerLockElement||target?.closest('input,textarea,select,button,[contenteditable="true"],[role="dialog"],.menu-layer,.match-layer'))return;
   event.preventDefault();event.stopImmediatePropagation();actions.current.toggle(true);
  };
  const keyup=(event:KeyboardEvent)=>{if(isOpen.current)event.stopImmediatePropagation();};
  const mouse=(event:MouseEvent)=>{const target=event.target as HTMLElement|null;if(!isOpen.current||!target?.closest('.game')||target.closest('.room-chat,.topbar,.menu-layer,.match-layer,button,input,textarea,select,a'))return;event.preventDefault();event.stopImmediatePropagation();actions.current.toggle(false);};
  // Babylon can suppress compatibility mousedown on the canvas. Use the completed
  // click, after mouseup, so resuming cannot turn that gesture into an attack.
  window.addEventListener('keydown',key,true);window.addEventListener('keyup',keyup,true);window.addEventListener('click',mouse,true);
  return()=>{alive.current=false;window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('click',mouse,true);input.current?.blur();callbacks.current.onOpenChange(false);};
 },[store]);
 useEffect(()=>{if(!open)return;input.current?.focus();const id=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(id);},[open]);
 useEffect(()=>{setFaded(false);const timer=setTimeout(()=>setFaded(true),8000);return()=>clearTimeout(timer);},[snapshot.messages]);
 useEffect(()=>{if(atBottom.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[snapshot.messages,open]);
 return <aside className={`room-chat ${open?'chat-open':faded?'chat-faded':''}`} aria-label="Room 채팅" onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
  <div className="chat-log" ref={log} tabIndex={open?0:-1} aria-label="채팅 기록" onScroll={()=>{const el=log.current;if(el)atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<25;}}>
   {(open?snapshot.messages:snapshot.messages.slice(-5)).map(message=><p key={message.messageId}><strong>{message.senderNickname}{message.senderId===session.room.sessionId?' (나)':''}</strong><span>{message.body}</span></p>)}
  </div>
  <span className="chat-announcement" aria-live="polite" aria-atomic="true">{snapshot.announcement}</span>
  {open?<><label className="chat-input">메시지<input ref={input} aria-label="채팅 메시지" value={draft} autoComplete="off" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onChange={e=>{text.current=e.target.value;setDraft(e.target.value);setError('');}}/></label><div className="chat-actions"><small>{Array.from(draft).length}/{CHAT.maxCodePoints} · Esc 닫기</small><button disabled={!snapshot.connected||pending} onClick={()=>void send()}>{pending?'서버 확인 중':'전송'}</button><button onClick={()=>toggle(false)}>닫기</button></div></>:<button className="chat-prompt" onClick={()=>toggle(true)}>Enter · Room 채팅</button>}
  {!snapshot.connected&&<p className="chat-error" role="status">연결이 끊겼습니다. 다시 입장해주세요.</p>}
  {error&&<p className="chat-error" role="alert">{error}</p>}
 </aside>;
}
