import {AUDIO,AUDIO_STORAGE_KEY,parseAudioSettings,type AudioSettings,type SoundKind} from './audioConfig';
import type {SoundCue} from './audioTimeline';
import type {Vec} from '../../../packages/game-core/src/simulation';
type Voice={gain:GainNode;pan:StereoPannerNode;source:AudioBufferSourceNode|null};
export class AudioManager{
 settings:AudioSettings;private context?:AudioContext;private master?:GainNode;private compressor?:DynamicsCompressorNode;
 private voices:Voice[]=[];private buffers=new Map<SoundKind,AudioBuffer>();private loading?:Promise<void>;
 private last=new Map<string,number>();private disposed=false;private hidden=false;
 constructor(){let raw=null;try{raw=localStorage.getItem(AUDIO_STORAGE_KEY);}catch{}this.settings=parseAudioSettings(raw);}
 get ready(){return this.context?.state==='running';}
 setSettings(settings:AudioSettings){this.settings={volume:Number.isFinite(settings.volume)?Math.max(0,Math.min(1,settings.volume)):AUDIO.defaultVolume,muted:settings.muted};try{localStorage.setItem(AUDIO_STORAGE_KEY,JSON.stringify(this.settings));}catch{}this.applyVolume();if(this.settings.muted||this.settings.volume===0)this.stop();}
 private applyVolume(){if(this.context&&this.master)this.master.gain.setTargetAtTime(this.hidden||this.settings.muted?0:this.settings.volume*AUDIO.headroom,this.context.currentTime,.015);}
 async unlock(){
  if(this.disposed)return;
  try{
   if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.compressor=this.context.createDynamicsCompressor();this.compressor.threshold.value=-12;this.compressor.ratio.value=8;this.master.connect(this.compressor);this.compressor.connect(this.context.destination);
    for(let i=0;i<AUDIO.voices;i++){const gain=this.context.createGain(),pan=this.context.createStereoPanner();gain.connect(pan);pan.connect(this.master);this.voices.push({gain,pan,source:null});}
   }
   // resume() is invoked synchronously inside the explicit user gesture.
   const resume=this.context.resume();this.applyVolume();
   if(!this.loading)this.loading=this.load();await resume;await this.loading;
  }catch{/* Audio failure must never fail the game. */}
 }
 private async load(){const context=this.context!;await Promise.all(Object.entries(AUDIO.effects).map(async([kind,effect])=>{
  try{const r=await fetch(`/assets/audio/${effect.file}`);if(!r.ok)return;const buffer=await context.decodeAudioData(await r.arrayBuffer());if(!this.disposed)this.buffers.set(kind as SoundKind,buffer);}catch{}
 }));}
 play(cue:SoundCue,listener:Vec,yaw:number,now:number){
  const context=this.context,buffer=this.buffers.get(cue.kind);
  if(this.disposed||this.hidden||this.settings.muted||this.settings.volume<=0||context?.state!=='running'||!buffer)return;
  const effect=AUDIO.effects[cue.kind],sourceKey=cue.actorId??'world';
  const key=`${cue.kind}:${sourceKey}`;if(now-(this.last.get(key)??-Infinity)<effect.interval)return;
  const dx=cue.position.x-listener.x,dy=cue.position.y-listener.y,dz=cue.position.z-listener.z,distance=Math.hypot(dx,dy,dz);
  if(!cue.near&&distance>AUDIO.maxDistance)return;
  const voice=this.voices.find(v=>!v.source);if(!voice)return;this.last.set(key,now);
  while(this.last.size>128)this.last.delete(this.last.keys().next().value!);
  const attenuation=cue.near?1:Math.min(1,AUDIO.referenceDistance/(AUDIO.referenceDistance+AUDIO.rolloff*Math.max(0,distance-AUDIO.referenceDistance)));
  const impact=cue.kind==='floor'||cue.kind==='rim'||cue.kind==='board'||cue.kind==='blockHit'?Math.min(1,Math.max(.12,cue.strength/7)):Math.min(1,cue.strength);
  voice.gain.gain.value=effect.gain*attenuation*impact;voice.pan.pan.value=cue.near?0:Math.max(-1,Math.min(1,(dx*Math.cos(yaw)-dz*Math.sin(yaw))/Math.max(1,distance)));
  // Web Audio sources are one-shot; gain/pan slots and decoded buffers are reused.
  const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=.98+Math.random()*.04;source.connect(voice.gain);voice.source=source;
  source.onended=()=>{source.disconnect();if(voice.source===source)voice.source=null;};
  // Preserve contact -> net ordering even when one snapshot delivers both late.
  const contactAt=Math.max(this.last.get('rim:world')??-Infinity,this.last.get('board:world')??-Infinity);
  const delay=cue.kind==='net'?Math.max(0,30-(now-contactAt))/1000:0;
  source.start(context.currentTime+delay);
 }
 setHidden(hidden:boolean){this.hidden=hidden;this.applyVolume();if(hidden){this.stop();void this.context?.suspend().catch(()=>{});}}
 stop(){for(const v of this.voices){const source=v.source;v.source=null;if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();}}this.last.clear();}
 dispose(){if(this.disposed)return;this.disposed=true;this.stop();for(const v of this.voices){v.gain.disconnect();v.pan.disconnect();}this.master?.disconnect();this.compressor?.disconnect();void this.context?.close().catch(()=>{});this.buffers.clear();this.voices.length=0;}
}
