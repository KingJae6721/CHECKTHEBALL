import test from 'node:test';import assert from 'node:assert/strict';
import {BackgroundMusic} from '../../../apps/web/game/backgroundMusic.ts';
import {BGM,parseAudioSettings} from '../../../apps/web/game/audioConfig.ts';
function fixture(){
 let creates=0,plays=0,pauses=0,fail=false,next=0;
 const frames=new Map<number,FrameRequestCallback>();
 const audio={src:'',loop:false,preload:'',volume:0,paused:true,currentTime:40,
  async play(){plays++;if(fail)throw Error('blocked');this.paused=false;},pause(){pauses++;this.paused=true;},removeAttribute(){this.src='';},load(){}};
 const music=new BackgroundMusic(()=>{creates++;return audio as unknown as HTMLAudioElement;},f=>{frames.set(++next,f);return next;},id=>{frames.delete(id);});
 const tick=(time:number)=>{const batch=[...frames.values()];frames.clear();batch.forEach(f=>f(time));};
 return {music,audio,tick,frames,get creates(){return creates;},get plays(){return plays;},get pauses(){return pauses;},fail(v:boolean){fail=v;}};
}
test('BGM migrates old preferences, clamps new fields and keeps master separate',()=>{
 assert.deepEqual(parseAudioSettings('{"volume":0.4,"muted":true}'),{volume:.4,muted:true,bgmEnabled:true,bgmVolume:.2});
 assert.equal(parseAudioSettings('{"bgmVolume":8,"bgmEnabled":false}').bgmVolume,1);
 assert.equal(parseAudioSettings('bad').bgmVolume,.2);
});
test('BGM stays lazy, loops one element, never seeks on scenes/settings and ducks without changing preferences',async()=>{
 const f=fixture(),settings={volume:.8,muted:false,bgmEnabled:true,bgmVolume:.2};f.music.setSettings(settings);assert.equal(f.creates,0);
 await f.music.activate();f.tick(0);f.tick(500);assert.equal(f.creates,1);assert.equal(f.audio.src,BGM.file);assert.equal(f.audio.loop,true);assert.ok(Math.abs(f.audio.volume-.16)<1e-8);
 f.music.setPlayingMatch(true);f.tick(600);f.tick(850);assert.ok(f.audio.volume>.08&&f.audio.volume<.16);
 f.music.setPlayingMatch(false);assert.equal(f.frames.size,1);f.tick(900);f.tick(1400);assert.ok(Math.abs(f.audio.volume-.16)<1e-8);
 await f.music.activate();assert.equal(f.plays,1);assert.equal(f.audio.currentTime,40);assert.equal(settings.bgmVolume,.2);f.music.dispose();assert.equal(f.frames.size,0);assert.equal(f.audio.src,'');
});
test('hidden pauses immediately; only actual previously playing music resumes; disabled/muted stays silent',async()=>{
 const f=fixture();f.music.setHidden(true);f.music.setHidden(false);assert.equal(f.plays,0);
 await f.music.activate();f.music.setHidden(true);assert.equal(f.audio.paused,true);assert.equal(f.frames.size,0);
 f.music.setHidden(false);assert.equal(f.plays,2);await Promise.resolve();
 f.music.setHidden(true);f.music.setSettings({volume:1,muted:false,bgmEnabled:false});f.music.setHidden(false);await f.music.activate();assert.equal(f.plays,2);
 f.music.setSettings({volume:1,muted:true});await f.music.activate();assert.equal(f.plays,2);f.music.dispose();
});
test('blocked/missing music resolves safely, no implicit retries; explicit retry and mute fade work',async()=>{
 const f=fixture();f.fail(true);await assert.doesNotReject(()=>f.music.activate());assert.equal(f.plays,1);
 f.music.setPlayingMatch(true);f.tick(0);f.tick(500);assert.equal(f.plays,1);
 f.fail(false);await f.music.activate();assert.equal(f.plays,2);
 f.music.setSettings({volume:1,muted:true});f.tick(1000);f.tick(1500);assert.equal(f.audio.volume,0);assert.equal(f.audio.paused,true);f.music.dispose();
});
