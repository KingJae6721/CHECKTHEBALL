import {validateNickname} from '../../../packages/protocol/src/nickname';
import {AUDIO_STORAGE_KEY,parseAudioSettings} from './audioConfig';
import {HEAD_BOB} from '../../../packages/game-core/src/court';
export type MenuScreen='HOME'|'FRIENDS'|'PRACTICE_SELECT'|'CONNECTING'|'PLAYING';
export const NICKNAME_KEY='check-the-ball.nickname.v1',CAMERA_KEY='check-the-ball.camera-motion.v1';
export type Store={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export function savePreference(store:Store|undefined,key:string,value:string){try{store?.setItem(key,value);}catch{}}
export function loadPreferences(store:Store|undefined,suggestion:string){
 const read=(key:string)=>{try{return store?.getItem(key)??null;}catch{return null;}};
 const previous=validateNickname(read(NICKNAME_KEY)),camera=read(CAMERA_KEY);
 return {nickname:previous.error?suggestion:previous.name,audio:parseAudioSettings(read(AUDIO_STORAGE_KEY)),camera:camera==='false'?false:camera==='true'?true:HEAD_BOB.enabled};
}
export function roomIdError(value:string){return /^[a-zA-Z0-9_-]{4,64}$/.test(value.trim())?null:'Room ID를 확인해주세요. 영문·숫자·-·_로 된 초대 코드를 입력하세요.';}
export function connectionError(error:unknown){
 const e=error as {code?:number;message?:string},message=e?.message??'';
 if(message.includes('INVALID_NICKNAME'))return '닉네임을 확인한 뒤 다시 참가해주세요.';
 if(e?.code===521||/full|maxClients|locked/i.test(message))return '방이 가득 찼습니다. 다른 방을 만들거나 빈자리를 확인해주세요.';
 if(e?.code===522||/not found|does not exist|invalid room/i.test(message))return '해당 방을 찾을 수 없습니다. Room ID를 확인해주세요.';
 if(e?.code===525||/MATCH_NOT_JOINABLE|auth/i.test(message))return '지금은 참가할 수 없는 방입니다. 경기가 이미 시작되었거나 종료되었습니다.';
 return '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.';
}
export class ConnectionAttempt{
 private generation=0;private pending=false;
 begin(){if(this.pending)return null;this.pending=true;return ++this.generation;}
 current(token:number){return this.pending&&token===this.generation;}
 finish(token:number){if(this.current(token))this.pending=false;}
 cancel(){this.generation++;this.pending=false;}
 accept(token:number,room:{close:()=>void}){if(this.current(token))return true;room.close();return false;}
}
