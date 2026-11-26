import type {RoomMode} from '../../game-core/src/match';
export const ROOM_DIRECTORY={maxName:30,maxPayloadBytes:1200,maxResults:50,requestTimeoutMs:8000} as const;
export const ROOM_CAPACITY:Record<RoomMode,number>={duel:2,practice:2,practice2v2:4,teamDuel:4};
export type RoomCreation={roomName:string;mode:RoomMode;isPrivate:boolean};
export type PublicRoom={roomId:string;roomName:string;mode:RoomMode;players:number;maxPlayers:number;status:'WAITING'};
export function roomName(value:unknown,nickname='게스트'):{name:string;error:string|null}{
 if(value!==undefined&&typeof value!=='string')return {name:'',error:'방 이름을 확인해주세요.'};
 const name=(value as string|undefined)?.trim()||`${nickname.trim()||'게스트'}의 코트`;
 if(/[\u0000-\u001f\u007f-\u009f]/u.test(typeof value==='string'?value:name))return {name,error:'방 이름에 제어 문자를 사용할 수 없습니다.'};
 if(Array.from(name).length>ROOM_DIRECTORY.maxName)return {name,error:`방 이름은 ${ROOM_DIRECTORY.maxName}자 이내로 입력해주세요.`};
 return {name,error:null};
}
export function roomCreation(value:unknown):{options:RoomCreation;error:string|null}{
 const fallback:RoomCreation={roomName:'게스트의 코트',mode:'practice',isPrivate:false};
 if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))return {options:fallback,error:'방 설정을 확인해주세요.'};
 const v=(value??{}) as Record<string,unknown>;
 try{if(new TextEncoder().encode(JSON.stringify(v)).length>ROOM_DIRECTORY.maxPayloadBytes)return {options:fallback,error:'방 설정 요청이 너무 큽니다.'};}catch{return {options:fallback,error:'방 설정을 확인해주세요.'};}
 if(v.mode!==undefined&&v.mode!=='duel'&&v.mode!=='practice'&&v.mode!=='practice2v2'&&v.mode!=='teamDuel')return {options:fallback,error:'지원하지 않는 경기 모드입니다.'};
 if(v.isPrivate!==undefined&&typeof v.isPrivate!=='boolean')return {options:fallback,error:'공개 설정을 확인해주세요.'};
 const named=roomName(v.roomName,typeof v.nickname==='string'?v.nickname:'게스트');
 return {options:{roomName:named.name,mode:v.mode==='duel'?'duel':v.mode==='practice2v2'?'practice2v2':v.mode==='teamDuel'?'teamDuel':'practice',isPrivate:v.isPrivate===true},error:named.error};
}
