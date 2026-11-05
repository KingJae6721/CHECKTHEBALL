import test from 'node:test';import assert from 'node:assert/strict';
import {validateNickname} from '../../protocol/src/nickname.ts';
import {ConnectionAttempt,loadPreferences,savePreference,connectionError,roomIdError,NICKNAME_KEY,CAMERA_KEY} from '../../../apps/web/game/menuState.ts';
import {AUDIO_STORAGE_KEY} from '../../../apps/web/game/audioConfig.ts';
test('guest names trim, reject empty/control/overlong names and keep text as text',()=>{
 assert.deepEqual(validateNickname(' 영재 '),{name:'영재',error:null});
 for(const name of ['', '  ', 'a\nb','x\u007fy','a'.repeat(21),null])assert.ok(validateNickname(name).error);
 assert.equal(validateNickname('<b>Guest</b>').error,null);assert.equal(validateNickname('<b>Guest</b>').name,'<b>Guest</b>');
});
test('existing profile/settings restore; blocked storage keeps memory defaults usable',()=>{
 const map=new Map([[NICKNAME_KEY,' Guest '],[CAMERA_KEY,'false'],[AUDIO_STORAGE_KEY,'{"volume":0.25,"muted":true}']]),store={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
 assert.deepEqual(loadPreferences(store,'Suggestion'),{nickname:'Guest',camera:false,audio:{volume:.25,muted:true}});
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(loadPreferences(blocked,'Suggestion').nickname,'Suggestion');assert.doesNotThrow(()=>savePreference(blocked,NICKNAME_KEY,'Memory only'));
 map.set(NICKNAME_KEY,'');assert.equal(loadPreferences(store,'Suggestion').nickname,'Suggestion');
});
test('duplicate connect is rejected, back invalidates late rooms, newer request stays current',()=>{
 const gate=new ConnectionAttempt(),first=gate.begin()!;assert.equal(gate.begin(),null);gate.cancel();const second=gate.begin()!;let closed=0;
 assert.equal(gate.accept(first,{close(){closed++;}}),false);assert.equal(closed,1);gate.finish(first);assert.equal(gate.current(second),true);assert.equal(gate.accept(second,{close(){closed++;}}),true);gate.finish(second);assert.equal(gate.current(second),false);
});
test('room validation and error reasons distinguish missing, full, unavailable and network',()=>{
 for(const id of ['', 'a b','x/'.repeat(3),'a'.repeat(65)])assert.ok(roomIdError(id));assert.equal(roomIdError(' Abc_123-4 '),null);
 assert.match(connectionError({code:522}),/찾을 수/);assert.match(connectionError({code:521}),/가득/);assert.match(connectionError({code:525}),/참가할 수/);assert.match(connectionError(new TypeError('Failed to fetch')),/연결하지 못/);
 assert.match(connectionError({code:522,message:'room "abc" is locked'}),/가득/);
});
