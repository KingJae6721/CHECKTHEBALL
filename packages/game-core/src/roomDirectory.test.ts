import test from 'node:test';import assert from 'node:assert/strict';
import {roomName,roomCreation,ROOM_DIRECTORY} from '../../protocol/src/rooms.ts';
import {RoomDirectory,directoryUrl} from '../../../apps/web/game/roomDirectory.ts';
const room={roomId:'test-room',roomName:'한글 <b>코트</b>',mode:'duel' as const,players:1,maxPlayers:2,status:'WAITING' as const};
test('room names count Unicode points; creation settings are bounded and capacity/status cannot be supplied',()=>{
 assert.equal(roomName('  ','영재').name,'영재의 코트');assert.equal(roomName('😀'.repeat(30)).error,null);assert.ok(roomName('😀'.repeat(31)).error);assert.equal(roomName(' <b>코트</b> ').name,'<b>코트</b>');
 for(const value of ['a\0b','a\nb',3])assert.ok(roomName(value).error);
 assert.deepEqual(roomCreation({nickname:'영재',mode:'duel',maxClients:999,metadata:{private:true}}).options,{roomName:'영재의 코트',mode:'duel',isPrivate:false});
 for(const options of [null,[],{mode:'bad'},{isPrivate:0},{extra:'a'.repeat(ROOM_DIRECTORY.maxPayloadBytes+1)}])assert.ok(roomCreation(options).error);
});
test('directory converts existing ws/wss URL without hardcoded hosts',()=>{
 assert.equal(directoryUrl('wss://game.example/base/'),'https://game.example/base/public-rooms');assert.equal(directoryUrl('ws://game.example:1234'),'http://game.example:1234/public-rooms');assert.throws(()=>directoryUrl(undefined));
});
test('directory distinguishes empty/success/error and preserves stale data on refresh failure',async()=>{
 let fail=false;const directory=new RoomDirectory(async()=>{if(fail)throw Error('offline');return [room];});
 await directory.refresh();const fetched=directory.getSnapshot().fetchedAt;assert.equal(directory.getSnapshot().rooms.length,1);fail=true;await directory.refresh();assert.ok(directory.getSnapshot().error);assert.equal(directory.getSnapshot().rooms[0],room);assert.equal(directory.getSnapshot().fetchedAt,fetched);directory.cancel();
 const empty=new RoomDirectory(async()=>[]);await empty.refresh();assert.deepEqual(empty.getSnapshot().rooms,[]);assert.equal(empty.getSnapshot().error,'');assert.ok(empty.getSnapshot().fetchedAt);
});
test('cancel and newer refresh invalidate late results; duplicate clicks never create extra requests',async()=>{
 const requests:{resolve:(value:typeof room[])=>void;signal:AbortSignal}[]=[];const directory=new RoomDirectory(signal=>new Promise(resolve=>requests.push({resolve,signal})));
 const first=directory.refresh();void directory.refresh();assert.equal(requests.length,1);directory.cancel();assert.equal(requests[0].signal.aborted,true);
 const second=directory.refresh();requests[1].resolve([room]);await second;requests[0].resolve([]);await first;assert.equal(directory.getSnapshot().rooms.length,1);directory.cancel();
});
