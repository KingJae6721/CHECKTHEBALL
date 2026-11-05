import {useRef,useState} from 'react';
export default function RoomInvite({code}:{code:string}){
 const input=useRef<HTMLInputElement>(null),[message,setMessage]=useState('');
 async function copy(){try{await navigator.clipboard.writeText(code);setMessage('Room ID를 복사했습니다.');}catch{input.current?.focus();input.current?.select();setMessage('초대 코드를 선택했습니다. 직접 복사해주세요.');}}
 return <div className="room-code"><label>초대 코드 · Room ID<input ref={input} aria-label="초대 코드" readOnly value={code} onFocus={e=>e.target.select()}/></label><button onClick={()=>void copy()}>Room ID 복사</button><small role="status">{message||'친구에게 알려주세요. 선택해서 직접 복사할 수도 있습니다.'}</small></div>;
}
