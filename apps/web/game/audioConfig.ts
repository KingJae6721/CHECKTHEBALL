// Initial mix/distance tuning; not measurements of real basketball recordings.
export const AUDIO={defaultVolume:.65,voices:12,headroom:.45,referenceDistance:2,maxDistance:28,rolloff:1,
 lateMs:180,maxWaitMs:1000,maxQueued:128,maxSeen:512,seenMs:5000,maxMotionGapMs:220,
 effects:{
  dribble:{file:'dribble.wav',gain:.75,interval:160},floor:{file:'bounce.wav',gain:.75,interval:65},
  step:{file:'step.wav',gain:.45,interval:150},rim:{file:'rim.wav',gain:.65,interval:65},
  board:{file:'board.wav',gain:.65,interval:65},net:{file:'net.wav',gain:.5,interval:100},
  jump:{file:'jump.wav',gain:.35,interval:200},land:{file:'land.wav',gain:.5,interval:200},
  blockJump:{file:'block-jump.wav',gain:.4,interval:200},blockHit:{file:'block-hit.wav',gain:.7,interval:100},
 }} as const;
export type SoundKind=keyof typeof AUDIO.effects;
export type AudioSettings={volume:number;muted:boolean};
export const AUDIO_STORAGE_KEY='check-the-ball.audio.v1';
export function parseAudioSettings(raw:string|null):AudioSettings{
 try{const v=JSON.parse(raw??'null');return {volume:typeof v?.volume==='number'&&Number.isFinite(v.volume)?Math.max(0,Math.min(1,v.volume)):AUDIO.defaultVolume,muted:v?.muted===true};}catch{return {volume:AUDIO.defaultVolume,muted:false};}
}
