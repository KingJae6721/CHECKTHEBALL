import {BGM,parseAudioSettings,type AudioSettings} from './audioConfig';

// App lifetime, independent of Babylon scenes and network events. One streaming element.
export class BackgroundMusic {
 private audio:HTMLAudioElement|null=null;
 private settings:AudioSettings=parseAudioSettings(null);
 private playingMatch=false;private activated=false;private hidden=false;private resumeAfterHidden=false;
 private disposed=false;private pending=false;private generation=0;private frame:number|null=null;
 constructor(private createAudio=()=>new Audio(),private request=(f:FrameRequestCallback)=>requestAnimationFrame(f),private cancel=(id:number)=>cancelAnimationFrame(id)){}
 private allowed(){return !this.disposed&&!this.hidden&&!this.settings.muted&&this.settings.volume>0&&this.settings.bgmEnabled!==false&&(this.settings.bgmVolume??BGM.defaultVolume)>0;}
 private target(){return this.allowed()?this.settings.volume*(this.settings.bgmVolume??BGM.defaultVolume)*(this.playingMatch?BGM.playingMultiplier:1):0;}
 private stopFade(){if(this.frame!==null)this.cancel(this.frame);this.frame=null;}
 private fade(){
  this.stopFade();const audio=this.audio;if(!audio)return;
  const from=audio.volume,to=this.target();let start:number|undefined;
  const tick=(time:number)=>{if(this.disposed)return;start??=time;const t=Math.min(1,(time-start)/BGM.fadeMs);audio.volume=from+(to-from)*t;
   if(t<1)this.frame=this.request(tick);else{this.frame=null;if(to===0)audio.pause();}};
  this.frame=this.request(tick);
 }
 setSettings(settings:AudioSettings){this.settings=parseAudioSettings(JSON.stringify(settings));if(!this.allowed()){this.generation++;this.pending=false;this.resumeAfterHidden=false;}this.fade();}
 setPlayingMatch(playing:boolean){if(this.playingMatch===playing)return;this.playingMatch=playing;this.fade();}
 // Call directly from a click: never retry blocked playback in a render loop.
 async activate(){
  if(!this.allowed()||this.pending)return;
  try{if(!this.audio){this.audio=this.createAudio();this.audio.src=BGM.file;this.audio.loop=true;this.audio.preload='none';this.audio.volume=0;}}catch{return;}
  this.activated=true;if(!this.audio.paused){this.fade();return;}
  const audio=this.audio,token=++this.generation;this.pending=true;
  try{await audio.play();if(this.disposed||!this.allowed()||token!==this.generation){if(this.disposed||!this.allowed())audio.pause();return;}this.fade();}
  catch{/* Blocked autoplay/missing file: explicit settings button can retry. */}
  finally{if(token===this.generation)this.pending=false;}
 }
 setHidden(hidden:boolean){
  if(this.hidden===hidden)return;
  if(hidden){this.resumeAfterHidden=!!this.audio&&!this.audio.paused;this.hidden=true;this.generation++;this.pending=false;this.stopFade();this.audio?.pause();if(this.audio)this.audio.volume=0;}
  else{this.hidden=false;const resume=this.resumeAfterHidden;this.resumeAfterHidden=false;if(resume&&this.activated&&this.allowed())void this.activate();}
 }
 dispose(){this.disposed=true;this.generation++;this.stopFade();if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.audio=null;}}
}
