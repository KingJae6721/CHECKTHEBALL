# CheckTheBall audio assets

## Mixkit recordings (2)

Historical assets: these two files are no longer selected for dribble/floor playback.
The active variants are the five user-supplied bounce files listed below.

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

## Freesound backboard recording — CC0

- Title: **Basketball backboard.wav**, by **PerMagnusLindborg**.
- Source: https://freesound.org/people/PerMagnusLindborg/sounds/324247/
- License: **CC0 1.0** — https://creativecommons.org/publicdomain/zero/1.0/
- `sounds/basketball_backboard.wav` → deployed `board.wav` (byte-for-byte copy).
- Runtime playback applies volume/distance attenuation and ±2% pitch variation.
- Replaces the previously used Pixabay MP3. The CC0 source and deployed WAV can be included in Git.

## Freesound net recording — CC BY 4.0

Historical single net sample: preserved but no longer selected. Active scoring playback uses
the seven user-supplied swish variations listed below.

- Title: **SPRTCourt-Samsung Galaxy Smartphone, CU_Basketball, Swish Into Net_Nicholas Judy_TDC**.
- Credit: **designerschoice / Nicholas Judy**, via Freesound.
- Author: https://freesound.org/people/designerschoice/
- Source: https://freesound.org/people/designerschoice/sounds/847042/
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**:
  https://creativecommons.org/licenses/by/4.0/
- `sounds/basketball_netsound.wav` → deployed `net.wav` (byte-for-byte copy).
- Modifications: renamed for deployment; runtime volume/distance attenuation and ±2% pitch variation.
- Source and deployed WAV may be shared under CC BY 4.0; preserve this attribution/license notice.
- Used only for confirmed baskets, not passes. The same recording currently serves clean and contact baskets.

## Synthetic temporary effects (4)

`jump.wav`, `land.wav`,
`block-jump.wav`, `block-hit.wav`: generated for this project by
`scripts/prepare-audio.py` from deterministic oscillators/noise/envelopes.
These contain no external samples and are project-generated assets, not real basketball recordings.
No voice/grunt samples are included. Backboard and net effects are actual recordings listed above.

## User-supplied bounce variations (5)

- `sounds/bounce_01.WAV` through `bounce_05.WAV` → `bounce_01.wav` through `bounce_05.wav`.
- Supplied by the user on 2026-11-05. Creator, source URL and license have not been provided;
  no CC0 or redistribution permission is asserted here.
- Files are copied unchanged; only deployment filename casing is normalized.
- Each controlled-dribble/crossover bounce and eligible free-ball floor impact selects one
  successfully loaded variant randomly. Each unique file is decoded once and shared by both effects.
- Runtime playback applies the existing gain, distance attenuation and ±2% pitch variation.

## User-supplied rim and swish variations

- `sounds/rim/rim_01.WAV` through `rim_05.WAV` → deployed `rim_01.wav` through `rim_05.wav`.
- `sounds/swish/swish_01.WAV` through `swish_07.WAV` → deployed `swish_01.wav` through `swish_07.wav`.
- The bounce originals have moved to `sounds/bounce/`; their deployed names stay unchanged.
- Source/creator/license for these variation sets have not been supplied. No license or author
  is inferred from the previous single net recording; its CC BY credit does not apply to these new files.
- Copied byte-for-byte with lowercase deployment filenames. Runtime gain, attenuation and ±2% pitch apply.
- Rim collisions randomly select a rim variation. Confirmed baskets randomly select a swish variation.
  The same swish pool is currently used for both clean and rim/backboard-contact baskets.
- The former synthetic `rim.wav` and single `net.wav` are not selected for playback.
