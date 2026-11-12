// Initial mix/distance tuning; not measurements of real basketball recordings.
const bounceFiles = ['bounce_01.wav', 'bounce_02.wav', 'bounce_03.wav', 'bounce_04.wav', 'bounce_05.wav'] as const;
const rimFiles = ['rim_01.wav', 'rim_02.wav', 'rim_03.wav', 'rim_04.wav', 'rim_05.wav'] as const;
const swishFiles = ['swish_01.wav', 'swish_02.wav', 'swish_03.wav', 'swish_04.wav', 'swish_05.wav', 'swish_06.wav', 'swish_07.wav'] as const;
export const AUDIO = {
    defaultVolume: .65, voices: 12, headroom: .45, referenceDistance: 2, maxDistance: 28, rolloff: 1,
    lateMs: 180, maxWaitMs: 1000, maxQueued: 128, maxSeen: 512, seenMs: 5000, maxMotionGapMs: 220,
    effects: {
        dribble: { files: bounceFiles, gain: .75, interval: 160 }, floor: { files: bounceFiles, gain: .75, interval: 65 },
        rim: { files: rimFiles, gain: .65, interval: 65 },
        board: { files: ['board.wav'], gain: .65, interval: 65 }, net: { files: swishFiles, gain: .5, interval: 100 },
        catch: { files: ['ball_catch_01.wav', 'ball_catch_02.wav', 'ball_catch_03.wav'], gain: .65, interval: 120 },
        jump: { files: ['jump.wav'], gain: .35, interval: 200 }, land: { files: ['land.wav'], gain: .5, interval: 200 },
        blockJump: { files: ['jump.wav'], gain: .4, interval: 200 }, blockHit: { files: ['block-hit.wav'], gain: .7, interval: 100 },
    }
} as const;
export type SoundKind = keyof typeof AUDIO.effects;
export const BGM = {file:'/assets/audio/Funkorama.mp3',defaultVolume:.2,playingMultiplier:.5,fadeMs:500} as const;
export type AudioSettings = { volume: number; muted: boolean; bgmEnabled?:boolean; bgmVolume?:number };
export const AUDIO_STORAGE_KEY = 'check-the-ball.audio.v1';
export function parseAudioSettings(raw: string | null): AudioSettings {
    let v;try{v=JSON.parse(raw??'null');}catch{}
    const volume=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
    return {volume:volume(v?.volume,AUDIO.defaultVolume),muted:v?.muted===true,bgmEnabled:v?.bgmEnabled!==false,bgmVolume:volume(v?.bgmVolume,BGM.defaultVolume)};
}
