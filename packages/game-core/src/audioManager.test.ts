import test from 'node:test';import assert from 'node:assert/strict';
import {AudioManager} from '../../../apps/web/game/audioManager.ts';import {AUDIO} from '../../../apps/web/game/audioConfig.ts';
test('one context, decoded assets reused, bounded voices, mute/visibility/dispose clean up',async()=>{
 const original={context:globalThis.AudioContext,fetch:globalThis.fetch,storage:Object.getOwnPropertyDescriptor(globalThis,'localStorage')};
 let contexts=0,decodes=0,sources=0,stops=0,closed=0,stored='';
 const sourceList:{onended:null|(()=>void);startTime?:number}[]=[];
 class Context{
  state='suspended';currentTime=0;destination={};constructor(){contexts++;}
  createGain(){return {gain:{value:0,setTargetAtTime(){}},connect(){},disconnect(){}};}
  createStereoPanner(){return {pan:{value:0},connect(){},disconnect(){}};}
  createDynamicsCompressor(){return {threshold:{value:0},ratio:{value:0},connect(){},disconnect(){}};}
  createBufferSource(){sources++;const source={buffer:null,playbackRate:{value:0},onended:null as null|(()=>void),startTime:0,connect(){},disconnect(){},start(time:number){this.startTime=time;},stop(){stops++;}};sourceList.push(source);return source;}
  async decodeAudioData(){decodes++;return {};}
  async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';closed++;}
 }
 try{
  globalThis.AudioContext=Context as unknown as typeof AudioContext;
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}) as Response;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_k:string,v:string)=>{stored=v;}}});
  const a=new AudioManager();await a.unlock();await a.unlock();assert.equal(contexts,1);assert.equal(decodes,23);
  const play=(kind:keyof typeof AUDIO.effects,now:number)=>a.play({key:'event:test',kind,position:{x:0,y:0,z:0},strength:7},{x:0,y:0,z:0},0,now);
  play('rim',1000);play('net',1000);assert.ok(sourceList[1].startTime!>sourceList[0].startTime!);
  for(let round=0;round<3;round++)for(const kind of Object.keys(AUDIO.effects))play(kind as keyof typeof AUDIO.effects,2000+round*1000);
  assert.equal(sources,AUDIO.voices);a.setSettings({volume:.3,muted:true});assert.equal(stops,AUDIO.voices);play('floor',9000);assert.equal(sources,AUDIO.voices);assert.deepEqual(JSON.parse(stored),{volume:.3,muted:true});
  a.setSettings({volume:.3,muted:false});play('floor',10000);assert.equal(sources,AUDIO.voices+1);
  a.setHidden(true);play('floor',11000);assert.equal(sources,AUDIO.voices+1);a.dispose();a.dispose();assert.equal(closed,1);
 }finally{
  globalThis.AudioContext=original.context;globalThis.fetch=original.fetch;
  if(original.storage)Object.defineProperty(globalThis,'localStorage',original.storage);else Reflect.deleteProperty(globalThis,'localStorage');
 }
});
test('audio loading and storage failures never reject gameplay activation',async()=>{
 const context=globalThis.AudioContext,storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{Reflect.deleteProperty(globalThis,'AudioContext');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});
  const audio=new AudioManager();await assert.doesNotReject(()=>audio.unlock());assert.doesNotThrow(()=>audio.setSettings({volume:.5,muted:false}));audio.dispose();
 }finally{globalThis.AudioContext=context;if(storage)Object.defineProperty(globalThis,'localStorage',storage);else Reflect.deleteProperty(globalThis,'localStorage');}
});
