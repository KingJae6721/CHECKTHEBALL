import test from 'node:test';import assert from 'node:assert/strict';
import {CHAT,chatText,chatRequest,mergeChat,type ChatMessage} from '../../protocol/src/chat.ts';
import {RoomChat} from '../../../apps/game-server/src/roomChat.ts';
import {RoomChatClient} from '../../../apps/web/game/roomChatClient.ts';
const request=(id:string,body='안녕')=>({clientMessageId:id,body});
test('chat normalizes newlines and whitespace, counts Unicode points and rejects invalid/oversize payloads',()=>{
 assert.equal(chatText(' \n 안녕\r\n친구\t ').body,'안녕 친구');assert.equal(chatText('😀'.repeat(200)).error,null);assert.ok(chatText('😀'.repeat(201)).error);
 for(const v of [null,5,'', '\n\t','a\0b','a\u0085b'])assert.ok(chatText(v).error);
 for(const v of [null,[],{body:'a'},request('x'.repeat(65)),{...request('a'),extra:'x'.repeat(1300)}])assert.ok(chatRequest(v).error);
 assert.equal(chatRequest(request('emoji','😀'.repeat(200))).error,null);
});
test('room chat uses authoritative identity/time, private rate errors, idempotence, bounded history, leave/dispose cleanup',()=>{
 let now=1000;const room=new RoomChat('r',()=>now);room.join('a');room.join('b');
 const first=room.receive('a','진짜',{...request('1'),senderId:'b',senderNickname:'가짜',sentAt:0});assert.ok('message'in first);if(!('message'in first))return;
 assert.equal(first.message.senderId,'a');assert.equal(first.message.senderNickname,'진짜');assert.equal(first.message.sentAt,1000);
 assert.equal((room.receive('a','진짜',request('1')) as any).duplicate,true);assert.equal(room.history.length,1);
 room.receive('a','진짜',request('2'));room.receive('a','진짜',request('3'));assert.ok('error'in room.receive('a','진짜',request('4')));assert.ok('message'in room.receive('b','다른 사람',request('4')));
 assert.ok('error'in room.receive('stranger','가짜',request('x')));
 now+=CHAT.windowMs;assert.ok('message'in room.receive('a','진짜',request('4')));
 for(let i=0;i<70;i++){now+=CHAT.windowMs;room.receive('a','진짜',request(`more${i}`));}assert.equal(room.history.length,30);
 assert.equal((room as any).members.get('a').seen.size<=32,true);assert.equal(room.recent('a')?.length,30);assert.equal(room.recent('a'),null);
 room.leave('a');assert.equal((room as any).members.has('a'),false);room.join('a');assert.ok('message'in room.receive('a','진짜',request('4')));room.dispose();assert.equal(room.history.length,0);assert.equal((room as any).members.size,0);
});
test('history/realtime merge stays ordered, deduplicated and capped',()=>{
 const messages=Array.from({length:80},(_,i):ChatMessage=>({messageId:`r:${i}`,senderId:'a',senderNickname:'한글',sentAt:i,body:'hi',clientMessageId:String(i)}));
 const merged=mergeChat(messages.slice(40),[...messages.slice(0,60),messages[79]]);assert.equal(merged.length,30);assert.deepEqual(merged.map(m=>m.messageId),messages.slice(-30).map(m=>m.messageId));
});
function client(){const handlers=new Map<string,(v:any)=>void>(),sent:{type:string;value:any}[]=[];const room={sessionId:'a',onMessage:(type:string,fn:(v:any)=>void)=>{handlers.set(type,fn);return()=>{handlers.delete(type);};},send:(type:string,value:any)=>{sent.push({type,value});}};const store=new RoomChatClient(room);return {store,handlers,sent};}
const message=(id:string,clientMessageId='x'):ChatMessage=>({messageId:id,senderId:'a',senderNickname:'한글',sentAt:100,body:'내용',clientMessageId});
test('client displays server ACK only, avoids history/live duplicates and announces only new messages',async()=>{
 const c=client();assert.equal(c.sent[0].type,'chatHistoryRequest');c.handlers.get('chatHistory')!([message('r:1')]);assert.equal(c.store.getSnapshot().announcement,'');
 const sent=c.store.send('내용');assert.equal(c.store.getSnapshot().messages.length,1);const id=c.sent.at(-1)!.value.clientMessageId;
 c.handlers.get('chatMessage')!(message('r:2',id));await sent;assert.equal(c.store.getSnapshot().messages.length,2);assert.match(c.store.getSnapshot().announcement,/한글/);
 c.handlers.get('chatHistory')!([message('r:1'),message('r:2',id)]);assert.equal(c.store.getSnapshot().messages.length,2);c.store.close();assert.equal(c.handlers.size,0);assert.equal(c.store.getSnapshot().messages.length,0);
});
test('client error/disconnect preserves resend identity, rejects pending and ignores late packets after close',async()=>{
 const c=client();const p=c.store.send('보존');const id=c.sent.at(-1)!.value.clientMessageId;
 c.handlers.get('chatError')!({clientMessageId:id,error:'대기'});await assert.rejects(p,/대기/);
 const again=c.store.send('보존');assert.equal(c.sent.at(-1)!.value.clientMessageId,id);c.store.setConnected(false);await assert.rejects(again,/연결/);await assert.rejects(c.store.send('다시'),/연결/);
 const late=c.handlers.get('chatMessage')!;c.store.close();late(message('r:4'));assert.equal(c.store.getSnapshot().messages.length,0);
});
test('missing ACK expires, keeps a stable retry ID and closes outstanding timers',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const c=client(),p=c.store.send('보존');const rejected=assert.rejects(p,/서버 확인/),id=c.sent.at(-1)!.value.clientMessageId;
 t.mock.timers.tick(CHAT.ackMs);await rejected;const again=c.store.send('보존'),closed=assert.rejects(again,/연결/);assert.equal(c.sent.at(-1)!.value.clientMessageId,id);c.store.close();await closed;t.mock.timers.tick(CHAT.ackMs*2);
});
