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
        jump: { files: ['jump.wav'], gain: .35, interval: 200 }, land: { files: ['land.wav'], gain: .5, interval: 200 },
        blockJump: { files: ['block-jump.wav'], gain: .4, interval: 200 }, blockHit: { files: ['block-hit.wav'], gain: .7, interval: 100 },
    }
} as const;
export type SoundKind = keyof typeof AUDIO.effects;
export type AudioSettings = { volume: number; muted: boolean };
export const AUDIO_STORAGE_KEY = 'check-the-ball.audio.v1';
export function parseAudioSettings(raw: string | null): AudioSettings {
    try { const v = JSON.parse(raw ?? 'null'); return { volume: typeof v?.volume === 'number' && Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : AUDIO.defaultVolume, muted: v?.muted === true }; } catch { return { volume: AUDIO.defaultVolume, muted: false }; }
}
