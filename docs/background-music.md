# BGM

Source: `sounds/songs/Funkorama.mp3` (8,199,078 bytes, user-supplied MP3).
The browser uses `/assets/audio/Funkorama.mp3`. The single public copy is identical
to the original, with no conversion or edits. `python scripts/prepare-audio.py`
recreates deployment audio assets; the current public assets are included in builds.
Credits: [audio attributions](../apps/web/public/assets/audio/ATTRIBUTIONS.md).

`apps/web/game/backgroundMusic.ts` owns one lazy HTMLAudioElement for the lifetime
of the Game component. It survives Babylon Scene/room/menu changes. It is disposed
with the app component, including Strict Mode cleanup. No server events or spatial
audio are used. Music loops normally; sample-perfect gapless looping is not promised.

The first trusted page click or ordinary key press attempts activation (including
nickname entry and settings clicks); mode/play clicks also provide recovery. The
one-time page listeners are removed after that first gesture and on app cleanup.
Initial page load does not play or
fetch music. Rejected playback never blocks game entry and is not retried by a timer.
Settings provides a **음악 재생** retry button, BGM enable, and BGM volume. Muted/disabled
music is respected. The existing master slider remains the master for both SFX and BGM;
the BGM slider does not change effects. Existing `check-the-ball.audio.v1` storage
is retained with optional `bgmEnabled`/`bgmVolume`; missing fields use defaults.
Blocked storage keeps in-memory settings.

Initial tuning in `audioConfig.ts` (`BGM`): enabled, 20% music volume, 50% multiplier
during online match stage PLAYING, 500ms volume fade. These are starting settings,
not listening measurements. Output = master × BGM volume × match multiplier.
Returning to menu, waiting, or match end restores the ordinary multiplier without
editing the saved slider. New fades replace old ones. Zero/muted music pauses once
faded; hidden tabs pause immediately. A visible tab resumes only if music was actually
playing before it was hidden and remains enabled. A blocked resume needs another click.

## Manual checks

1. Open a fresh page: no automatic music. Click anywhere or type a nickname: music starts, or
   settings → 음악 재생 recovers from browser autoplay restrictions.
2. Switch menu → room → game → home: one continuous track, no restart or overlap.
3. Adjust master and BGM separately; verify SFX unchanged by BGM slider. Mute,
   disable BGM, reload and verify saved settings, including older saved settings.
4. Start/end a match: music smoothly ducks/restores; slider value stays the same.
5. Hide/show tab: playback pauses/resumes at its position. Disable while hidden:
   no unintended restart. Block localStorage: controls continue to work.
6. Simulate MP3 request failure: game still enters, SFX still work; restore request
   and click 음악 재생. Listen for loop quality and tune perceived volume.

Automated tests use a fake media element/frame scheduler for lifetime, play rejection,
volume/fade replacement, settings migration, tab policy, and disposal. They do not
verify browser autoplay policies, audible quality, or perceived mixing.
