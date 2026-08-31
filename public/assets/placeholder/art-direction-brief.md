# Step 32 Placeholder Art Direction

## Technical frame

- Engine: Phaser 4.2.1, 2D canvas/WebGL rendering.
- Native game viewport: 360×640 portrait, scaled with `FIT` and `CENTER_BOTH`.
- Runtime sprites: 128×128 RGBA PNGs, displayed between 14 and 54 logical pixels.
- Filtering: smooth scaling is intentional for the clean-HD cartoon source.
- Camera: side/three-quarter sprites with a shared upper-left highlight.
- Animation: three original 4-frame sheets use 128×128 cells. Frame selection and
  transforms run on the cosmetic clock only; no sprite-sheet animation is authoritative.

## Visual system

- Rounded, chunky silhouettes that remain recognizable at 28–48 pixels.
- Dark navy outline, two or three value bands, minimal surface noise.
- Navy and steel blue communicate machinery and structure.
- Teal communicates active production; warm gold communicates rewards and progress.
- Orange and cream make the miner distinct from the blue mine equipment.
- Locked objects stay dark blue with a gold keyhole; enabled upgrades use a gold arrow.
- English labels, prices, progress, focus, and interaction states remain code-native.
- The surface reads as a connected operations yard, the left underground column is one
  continuous steel elevator shaft, and four timber-lined tunnel floors sit to its right.
- Motion is short and workmanlike: a compact pick swing, a rotating pulley/cabin indicator,
  and a warehouse shutter receiving one crate without detached effects.

## Acceptance target

At native scale and at a 320×568 phone viewport, a player must distinguish the miner,
elevator, warehouse, gold, locked floor, and upgrade action without relying on copied
branding or third-party art. Progress bars and panel backgrounds remain code-native UI,
not sprite artwork.
