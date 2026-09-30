# Boru — approved excavator Miner

Original built-in imagegen artwork, 2026-09-30. User approved the concept in
this chat. No external character or licensed stock references were used.
The concept is under `concept/`; four exact action prompts are in the sibling
action directories. Raw outputs are retained in each `processed/raw-sheet.png`.

- travel-empty: imagegen exec-a9497f23-8bb9-4b41-ae64-3a2013e2ac11
- scoop: imagegen exec-11f3982d-9525-4ca8-b4d3-5e68a1c3df1a
- travel-loaded: imagegen exec-dd2154e1-3d66-4ad5-92eb-e4bd8562d3e0
- deposit: imagegen exec-2e1cf2a1-24fc-4e8d-bfe2-423d07f925da

All sheets: eight authored frames, 2 rows x 4 columns, not ping-pong duplicates.
generate2dsprite removes magenta and uses one preserve-scale profile (0.72).
The initial 0.92 profile was rejected for output-edge contact; the shared
safety margin was reduced for ALL actions, not for individual frames.
`scripts/normalize-boru-assets.py` then translates frames onto the track root
(64,112), never resizes them or centers the moving bucket. Alignment bounds
and translations are recorded in `alignment-qc.json`. No clipping is allowed.
The catalog portrait is a separate deterministic derivative of the first
aligned empty-travel frame. Its alpha bounds are cropped, then enlarged to fit
inside a 116x104 area of the 128x128 canvas; the resulting visible bounds are
116x92. Source: `portrait/idle-1.png`; runtime sheets are not resized.

The generated deposit's falling gold is clipped to the body's processor
component bounds; no detached effect is used outside that envelope. Runtime
uses complete-sheet mirroring and normalized core extraction progress.
Native/mobile validation is recorded in the acceptance gate, not inferred
from generation. Generated-media terms require release-owner review before
external commercial distribution; this record is not a legal license grant.
