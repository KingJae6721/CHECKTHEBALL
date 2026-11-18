import {ROOM_DIRECTORY,type PublicRoom} from '../../../packages/protocol/src/rooms';
export function directoryUrl(address:string|undefined){
 if(!address||!/^wss?:\/\//.test(address))throw Error('게임 서버 주소 설정을 확인해주세요.');
 const url=new URL(address);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname=url.pathname.replace(/\/$/,'')+'/public-rooms';url.search='';url.hash='';return url.href;
}
export async function fetchPublicRooms(signal:AbortSignal):Promise<PublicRoom[]>{
 const response=await fetch(directoryUrl(process.env.NEXT_PUBLIC_GAME_SERVER_URL),{signal,cache:'no-store'});
 if(!response.ok)throw Error(response.status===403?'방 목록 접근 설정을 확인해주세요. 서버의 웹 origin 설정이 필요합니다.':'방 목록을 불러오지 못했습니다. 다시 시도해주세요.');
 const payload=await response.json();
 if(!Array.isArray(payload?.rooms)||payload.rooms.length>ROOM_DIRECTORY.maxResults)throw Error('방 목록 응답을 확인할 수 없습니다.');
 return payload.rooms.map((r:PublicRoom)=>{
  if(!r||typeof r.roomId!=='string'||typeof r.roomName!=='string'||Array.from(r.roomName).length>ROOM_DIRECTORY.maxName||!['duel','practice'].includes(r.mode)||r.status!=='WAITING'||!Number.isSafeInteger(r.players)||!Number.isSafeInteger(r.maxPlayers)||r.players<1||r.players>=r.maxPlayers)throw Error('방 목록 응답을 확인할 수 없습니다.');
  return {roomId:r.roomId,roomName:r.roomName,mode:r.mode,players:r.players,maxPlayers:r.maxPlayers,status:r.status};
 });
}
export class RoomDirectory{
 private snapshot:{rooms:PublicRoom[];loading:boolean;error:string;fetchedAt:number|null}={rooms:[],loading:false,error:'',fetchedAt:null};
 private listeners=new Set<()=>void>();private controller:AbortController|undefined;private timeout:ReturnType<typeof setTimeout>|undefined;private revision=0;
 constructor(private fetcher=fetchPublicRooms){}
 getSnapshot=()=>this.snapshot;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 private update(next:Partial<typeof this.snapshot>){this.snapshot={...this.snapshot,...next};for(const fn of this.listeners)fn();}
 async refresh(){
  if(this.snapshot.loading)return;
  const revision=++this.revision,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),ROOM_DIRECTORY.requestTimeoutMs);this.controller=controller;this.timeout=timeout;this.update({loading:true,error:''});
  try{const rooms=await this.fetcher(controller.signal);if(revision===this.revision)this.update({rooms,fetchedAt:Date.now(),loading:false});}
  catch(error){if(revision===this.revision)this.update({loading:false,error:error instanceof Error&&error.message.includes('origin')?error.message:'방 목록을 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.'});}
  finally{clearTimeout(timeout);if(revision===this.revision){this.controller=undefined;this.timeout=undefined;}}
 }
 cancel(){this.revision++;this.controller?.abort();this.controller=undefined;clearTimeout(this.timeout);this.timeout=undefined;if(this.snapshot.loading)this.update({loading:false});}
}
