export const CHAT={maxCodePoints:200,maxPayloadBytes:1200,windowMs:5000,perWindow:3,history:30,dedupPerUser:32,dedupMs:60000,ackMs:5000} as const;
export type ChatMessage={messageId:string;senderId:string;senderNickname:string;sentAt:number;body:string;clientMessageId:string};
export type ChatError={clientMessageId?:string;error:string};
export function chatText(value:unknown):{body:string;error:string|null}{
 if(typeof value!=='string')return {body:'',error:'메시지는 문자열이어야 합니다.'};
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value))return {body:'',error:'제어 문자는 사용할 수 없습니다.'};
 const body=value.replace(/[\r\n\t\u2028\u2029]+/gu,' ').trim();
 if(!body)return {body,error:'메시지를 입력해주세요.'};
 if(Array.from(body).length>CHAT.maxCodePoints)return {body,error:`메시지는 ${CHAT.maxCodePoints}자 이내로 입력해주세요.`};
 return {body,error:null};
}
export function chatRequest(value:unknown):{body:string;clientMessageId:string;error:string|null}{
 const invalid={body:'',clientMessageId:'',error:'잘못된 채팅 요청입니다.'};
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid;
 const v=value as Record<string,unknown>;
 if(typeof v.clientMessageId!=='string'||!/^[-\w]{1,64}$/.test(v.clientMessageId))return invalid;
 try{if(new TextEncoder().encode(JSON.stringify(value)).length>CHAT.maxPayloadBytes)return {...invalid,clientMessageId:v.clientMessageId,error:'메시지 요청이 너무 큽니다.'};}catch{return invalid;}
 return {...chatText(v.body),clientMessageId:v.clientMessageId};
}
export function mergeChat(current:readonly ChatMessage[],incoming:readonly ChatMessage[]){
 const map=new Map(current.map(m=>[m.messageId,m]));for(const message of incoming)map.set(message.messageId,message);
 return [...map.values()].sort((a,b)=>a.sentAt-b.sentAt||a.messageId.localeCompare(b.messageId,undefined,{numeric:true})).slice(-CHAT.history);
}
