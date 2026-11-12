import {CHAT,chatRequest,mergeChat,type ChatMessage,type ChatError} from '../../../packages/protocol/src/chat';
type ChatRoom={sessionId:string;send:(type:string,value?:unknown)=>void;onMessage:(type:string,callback:(value:any)=>void)=>()=>void};
type Pending={resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
export class RoomChatClient{
 private listeners=new Set<()=>void>();private removers:(()=>void)[]=[];private pending=new Map<string,Pending>();private counter=0;private closed=false;private retry?:{body:string;id:string};
 private snapshot:{messages:ChatMessage[];connected:boolean;announcement:string}={messages:[],connected:true,announcement:''};
 constructor(private room:ChatRoom){
  this.removers.push(room.onMessage('chatMessage',(message:ChatMessage)=>this.receive([message],false)),room.onMessage('chatHistory',(history:ChatMessage[])=>this.receive(history,true)),room.onMessage('chatError',(error:ChatError)=>{if(error?.clientMessageId)this.finish(error.clientMessageId,new Error(error.error));}));
  try{room.send('chatHistoryRequest');}catch{this.setConnected(false);}
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.snapshot;
 private notify(){for(const listener of this.listeners)listener();}
 private receive(messages:ChatMessage[],history:boolean){
  if(this.closed||!Array.isArray(messages))return;
  const valid=messages.slice(-CHAT.history).filter(m=>m&&typeof m.messageId==='string'&&typeof m.body==='string'&&typeof m.senderNickname==='string'&&typeof m.senderId==='string'&&Number.isFinite(m.sentAt));
  const fresh=valid.filter(m=>!this.snapshot.messages.some(old=>old.messageId===m.messageId));
  for(const message of valid)if(message.senderId===this.room.sessionId)this.finish(message.clientMessageId);
  if(!fresh.length)return;
  this.snapshot={...this.snapshot,messages:mergeChat(this.snapshot.messages,valid),announcement:history?'':fresh.map(m=>`${m.senderNickname}: ${m.body}`).join(' ')};this.notify();
 }
 private finish(id:string,error?:Error){const p=this.pending.get(id);if(!p)return;clearTimeout(p.timer);this.pending.delete(id);if(error)p.reject(error);else{if(this.retry?.id===id)this.retry=undefined;p.resolve();}}
 send(body:string){
  if(this.closed||!this.snapshot.connected)return Promise.reject(Error('연결이 끊겨 전송할 수 없습니다.'));
  if(this.pending.size)return Promise.reject(Error('이전 메시지의 서버 확인을 기다리는 중입니다.'));
  const id=this.retry?.body===body?this.retry.id:`${Date.now().toString(36)}_${++this.counter}`;
  const request=chatRequest({body,clientMessageId:id});if(request.error)return Promise.reject(Error(request.error));
  this.retry={body,id};
  return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>this.finish(id,Error('서버 확인이 늦습니다. 내용을 보존했습니다. 다시 전송할 수 있습니다.')),CHAT.ackMs);this.pending.set(id,{resolve,reject,timer});try{this.room.send('chatSend',{body:request.body,clientMessageId:id});}catch{this.finish(id,Error('메시지를 보내지 못했습니다. 다시 시도해주세요.'));}});
 }
 setConnected(connected:boolean){if(this.closed)return;this.snapshot={...this.snapshot,connected};if(!connected)for(const id of this.pending.keys())this.finish(id,Error('연결이 끊겨 전송을 확인하지 못했습니다.'));this.notify();}
 close(){if(this.closed)return;this.setConnected(false);this.closed=true;for(const remove of this.removers)remove();this.removers.length=0;this.snapshot={messages:[],connected:false,announcement:''};this.retry=undefined;this.listeners.clear();}
}
