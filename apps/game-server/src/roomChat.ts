import {CHAT,chatRequest,type ChatMessage,type ChatError} from '../../../packages/protocol/src/chat';
type Member={times:number[];seen:Map<string,ChatMessage>;historyAt:number};
export class RoomChat{
 readonly history:ChatMessage[]=[];private members=new Map<string,Member>();private sequence=0;
 constructor(private roomId:string,private now=Date.now){}
 join(id:string){this.members.set(id,{times:[],seen:new Map(),historyAt:-Infinity});}
 leave(id:string){this.members.delete(id);}
 recent(id:string){const m=this.members.get(id),now=this.now();if(!m||now-m.historyAt<500)return null;m.historyAt=now;return [...this.history];}
 receive(id:string,nickname:string,value:unknown):{message:ChatMessage;duplicate:boolean}|{error:ChatError}{
  const m=this.members.get(id);if(!m)return {error:{error:'Room 참가자만 채팅할 수 있습니다.'}};
  const request=chatRequest(value);if(request.error)return {error:{clientMessageId:request.clientMessageId||undefined,error:request.error}};
  const now=this.now();for(const [key,message]of m.seen)if(now-message.sentAt>CHAT.dedupMs)m.seen.delete(key);
  const duplicate=m.seen.get(request.clientMessageId);if(duplicate)return {message:duplicate,duplicate:true};
  m.times=m.times.filter(time=>now-time<CHAT.windowMs);
  if(m.times.length>=CHAT.perWindow)return {error:{clientMessageId:request.clientMessageId,error:'잠시 기다려주세요. 5초에 3개까지 보낼 수 있습니다.'}};
  m.times.push(now);
  const message:ChatMessage={messageId:`${this.roomId}:${++this.sequence}`,senderId:id,senderNickname:nickname,sentAt:now,body:request.body,clientMessageId:request.clientMessageId};
  m.seen.set(request.clientMessageId,message);while(m.seen.size>CHAT.dedupPerUser)m.seen.delete(m.seen.keys().next().value!);
  this.history.push(message);if(this.history.length>CHAT.history)this.history.shift();return {message,duplicate:false};
 }
 dispose(){this.members.clear();this.history.length=0;}
}
