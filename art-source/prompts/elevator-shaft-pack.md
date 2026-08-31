# Elevator shaft frame + cabin pack — Gemini 3.1 Pro Image prompts

Target geometry (logical pixels, from `src/game/layout/mineLayout.ts`):

- Shaft column: 48 wide x 552 tall (`MINE_SHAFT_WIDTH`), drawn at `x = 8` inside the
  scrolling mine.
- Four floor segments, 138 tall each; a cross beam sits at every segment line.
- Rails: 4 px wide (`MINE_SHAFT_RAIL_WIDTH`) at `shaft.x + 11` and `shaft.x + 33`
  (`MINE_SHAFT_RAIL_INSET`).
- Floor plaque: 26 x 24; the number itself is code-native text.
- Travelling cabin sprite: displayed at 36 x 36 (`MINE_SHAFT_CABIN_SIZE`).

Size warning: `MINE_SHAFT_CABIN_SIZE` is 36 and the car is drawn square. A 74%
interior opening leaves about 26 logical pixels for the porter cat, below the 28-48
band the art-direction brief calls readable. If the cat reads as a blob, widen
`MINE_SHAFT_WIDTH` to 56 and the car to 44 — that costs the floor panels 8 px of
width and touches the floor-layout tests.

Palette locks (`src/game/layout/palette.ts`) — e2e pixel probes read these hexes,
so generated art must match them rather than replace them:
`SHAFT_BACKGROUND #172536`, `SHAFT_RAIL #6688aa`, `SHAFT_BEAM #304a66`,
`MINE_BACKGROUND #101827`, gold `#f4bd3e`, steel blue `#41658a`, teal `#2ea9a1`.

Attach as reference images: `public/assets/placeholder/elevator.png` (identity and
style), and for the animation sheet `art-source/placeholder-animation/references/2x2-layout-guide.png`
(geometry only). A 3x3 guide is not stored in the repo; generate one or rely on the
text grid description.

---

## Prompt 1 — parts sheet (3x3, chroma-key, feeds the existing slicing pipeline)

The cabin is a **freight** car: a porter cat sprite stands inside it, composited at
runtime, so the interior is drawn empty and open. Cells 1-3 are three layers of the
same car and must register pixel-for-pixel.

```
Use case: stylized-concept
Asset type: original 2D sprite pack for a 360x640 portrait idle mining game; freight elevator car and shaft structure
Reference image role: elevator.png is the identity and style anchor only — same cartoon family, same outline weight, same palette, same lighting. Do not copy its composition or redraw it verbatim in every cell.
Primary request: Create one exact 3x3 sprite sheet with nine distinct isolated assets, one centred asset per cell.

The subject of cells 1, 2 and 3 is one freight elevator car: an open-front cargo cage big enough for a standing worker, seen straight from the front. Its clear interior opening must be at least 74% of the car's width and 74% of its height, left completely empty, so a separate character sprite can be composited inside it later. Keep the roof, the deck and the corner posts thin and chunky rather than ornate — they are the only structure allowed to eat into that opening.

Cell order, left to right, top to bottom:
1) freight car, back layer — deck plate with a warm-gold #f4bd3e wear stripe along its front lip, flat roof with a small overhead gantry and a short cable stub, two chunky corner posts, a riveted steel back wall filling the interior opening, and a guide shoe on each outer side. This layer is drawn behind the character.
2) freight car, front layer — exactly the same footprint, posts, roof and deck as cell 1, but the interior opening is completely empty with nothing behind it: only the front cage bars, a low kick rail across the bottom of the opening, and the top beam. This layer is drawn in front of the character.
3) freight car, assembled and empty — the same car with its cage gate pulled down and closed, empty deck, small teal #2ea9a1 indicator lamp lit on the top beam. This is the standalone idle state.
4) shaft head unit — winch housing that caps the top of the shaft: a large gold pulley wheel on a navy steel motor block with a bolted mounting plate, cable descending from the wheel and cut cleanly at the bottom edge of the subject
5) cross beam — a single horizontal steel girder spanning left to right, roughly four times wider than tall, riveted end plates, one lighter top facet
6) guide rail segment — a single vertical steel guide rail, roughly four times taller than wide, with two bracket clamps, flat colour so it reads as a repeating structural piece
7) floor landing plaque — a small rounded steel plaque with four corner rivets and a completely blank recessed centre panel, no number, no symbol, no engraving
8) counterweight — a compact stacked steel weight block hanging on a short cable stub, gold trim band
9) shaft base bumper — the bottom cap of the shaft: a heavy steel buffer plate on two thick coil springs, sitting flat

Registration: cells 1, 2 and 3 must share the identical silhouette, footprint, position and scale inside their cells, so that layer 1 and layer 2 stack perfectly with no offset and no size difference.
View: straight-on front elevation for every cell, orthographic, no perspective distortion, consistent camera and scale family
Art direction: rounded chunky silhouettes, clean HD 2D cartoon rendering, dark navy outline, two or three value bands, minimal surface texture, soft upper-left highlight; palette anchored by shaft navy #172536, rail steel blue #6688aa, beam blue #304a66, panel steel blue #41658a, warm gold #f4bd3e, teal indicator #2ea9a1, cream #f4ead5
Game-scale read: the car is displayed 36 pixels tall and everything else at 20-40 pixels; exaggerate silhouette-defining parts, drop tiny detail, keep the cage bars few and thick
Technical output: square 3x3 grid, each asset fully inside the central 60% of its cell with generous padding, matched visual density, solid exact #FF00FF background across the entire image
Constraints: exactly one asset per cell in the stated order; no overlap between cells; identical outline, palette, lighting and material language across all nine; no cast shadow outside the subject; no transparency, because the magenta is removed deterministically; the magenta must also show through the empty interior of cells 1 and 2
Avoid: any character, cat, animal, worker or figure inside or beside the car; cargo, crates, ore, sacks or gold piled in the car; text, numbers, labels, capacity plates with writing, UI panels, scenery, rock walls, ground planes, grid lines, cell borders, mockup frames, duplicate subjects, cropped edges, background gradients, signatures, watermarks, logos
```

## Prompt 2 — seamless vertical shaft tile (single opaque image, no chroma-key)

This one is the repeating column behind the cabin. It must run edge to edge, so it
is *not* padded and *not* magenta — do not send it through the chroma-key step.

```
Use case: stylized-concept
Asset type: one seamless vertically tileable background tile for the elevator shaft of a 2D portrait idle mining game
Primary request: A single square tile, 1:1, showing a 48-pixel-wide steel elevator shaft interior scaled up 2x, drawn straight from the front, orthographic, no perspective.

Composition, measured on a 96-wide tile (the 48-pixel shaft at 2x):
- full-bleed background in shaft navy #172536, subtly darker toward the left and right edges
- two vertical steel guide rails in #6688aa, each 8 pixels wide, their left edges at x=22 and x=66, running unbroken from the very top edge to the very bottom edge
- flat riveted wall panels in #304a66 between and outside the rails, joints strictly horizontal
- a soft cool highlight down the left side of each rail
- the top edge and the bottom edge must match exactly so the tile repeats vertically with no visible seam

Art direction: clean HD 2D cartoon, flat two-to-three value bands, minimal noise, dark navy outline only where shapes meet, mobile-game readability
Constraints: content runs fully to all four edges, no padding, no vignette, no rounded corners, no border, no transparency, no magenta
Avoid: characters, cabins, cargo, cables, rock, dirt, ladders, lamps, text, numbers, UI, logos, watermarks, perspective, diagonal structure, anything that breaks vertical repetition
```

## Prompt 3 — cross beam / floor landing strip (wide tile, optional)

```
Same style family and palette as the shaft tile. One horizontal steel landing beam
spanning the full 96-pixel width of the shaft, about 20 pixels tall, drawn straight
from the front: a #304a66 girder with a lighter top facet, riveted end plates seated
against both rails, and a thin warm-gold #f4bd3e wear stripe along its top edge.
Content runs fully to the left and right edges; the top and bottom edges are the
subject's own silhouette on a solid exact #FF00FF background. No text, no numbers,
no plaque, no characters, no scenery, no logos.
```

## Prompt 4 — car travel loop (2x2, four frames, chroma-key)

Run this after cell 3 of prompt 1 is cut and cleaned; attach that car as the
identity reference and the 2x2 layout guide as geometry only.

```
Using the assembled freight-car image as the identity and style reference and the 2x2 guide
for geometry only. Four-frame seamless travelling loop in a 2x2 grid: the cabin body
stays rooted, identical, and centred in every frame; only the gold pulley wheel
rotates one quarter turn per frame, the cable flexes slightly, and the teal indicator
lamp pulses. Preserve the clean-HD cartoon palette, outline weight, front view, scale,
and bottom anchor. Solid #FF00FF background. No borders, rails, shaft walls, scenery,
characters, cargo, motion streaks, text, UI, logos, signatures, or edge crossing.
```

## Negative prompt (all four)

```
photorealistic, 3D render, isometric, perspective distortion, pixel art, retro 8-bit,
sketch, line art, painterly texture, heavy grain, harsh black outlines, drop shadows
outside the subject, background gradient, vignette, cell borders, grid lines, mockup
frame, text, numbers, labels, watermark, signature, logo, branding, duplicate subjects,
cropped or edge-touching subjects (except the tiles that are explicitly full-bleed)
```

## After generating

1. Chroma-key and slice prompts 1, 3, 4 with the existing pipeline; keep prompt 2
   opaque.
2. Downscale to 128x128 cells (36x36 display for the car, 26x24 for the plaque).
   Cells 1 and 2 keep the same crop box so the two layers stay registered — do not
   bbox-crop them independently.
3. Add every kept file to `public/assets/placeholder/asset-manifest.json` with its
   source tool, model, and rights block, and register the runtime keys in
   `src/game/assets/placeholderAssets.ts`.
4. Rails, beams, and the shaft background are currently Phaser rectangles in
   `BootScene.#createMineContent`. Replacing them with sprites changes the pixels the
   `mine-views` and `mine-scroll` e2e probes sample, so update those probes in the
   same change.
