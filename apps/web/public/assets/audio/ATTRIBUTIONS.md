# CheckTheBall audio assets

## Mixkit recordings (2)

User-supplied files, source confirmed by the user on 2026-11-05:
https://mixkit.co/free-sound-effects/basketball/

- `sounds/basketball-ball-drible-2093.wav` → deployed `dribble.wav`.
- `sounds/basketball-ball-bouncing.wav` → deployed `bounce.wav`.
- User identifies the supplied pair as “Basketball ball, hard hit” and “Basketball ball bouncing”.
- Provider: Mixkit. Individual recordist/creator is not named on the listing.
- License: **Mixkit Sound Effects Free License**, checked 2026-11-05:
  https://mixkit.co/license/modal/sfxFree/
- Permits use/modification in commercial and non-commercial end products including video games.
  This is **not CC0**. Do not redistribute as standalone stock, in tools/templates or with source files.
- Supplied WAVs and deployed Mixkit derivatives are excluded from Git source distribution.
  Local builds include derivatives as part of the playable game's static assets.
  Source recipients must obtain their own licensed copies and run `python scripts/prepare-audio.py`.
- Processing: stereo 24-bit → mono 16-bit PCM, leading silence trimmed (2ms retained),
  peak normalized to 0.8, 5ms tail fade. Originals are preserved.
- Playback may vary pitch by ±2%. There is no external hotlink.

## User-supplied Pixabay recording (1)

- `sounds/freesound_community-basketball-backboard-83558.mp3` → deployed `board.mp3`.
- Title: **Basketball backboard**. Creator listed by the user: **freesound_community**.
- Source supplied by the user: https://pixabay.com/sound-effects/film-special-effects-basketball-backboard-83558/
- Creator: https://pixabay.com/users/freesound_community-46691455/
- Pixabay Content License: https://pixabay.com/service/license-summary/
- Added at the user's explicit request. The current item/terms were not independently browsed,
  per the user's instruction. No CC0 claim is made. Preserve applicable Pixabay terms;
  do not distribute this file as standalone stock. Excluded from Git source distribution.
- Processing: byte-for-byte copy as MP3; gameplay playback gain/distance attenuation and ±2% pitch variation.

## Synthetic temporary effects (7)

`step.wav`, `rim.wav`, `net.wav`, `jump.wav`, `land.wav`,
`block-jump.wav`, `block-hit.wav`: generated for this project by
`scripts/prepare-audio.py` from deterministic oscillators/noise/envelopes.
These contain no external samples and are project-generated assets, not real basketball recordings.
No voice/grunt samples are included. The same temporary net sample is used for clean and contact baskets;
the event carries contact history so a future licensed replacement can distinguish them.
