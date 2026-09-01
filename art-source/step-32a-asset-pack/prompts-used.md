# Step 32A asset prompts

Generated with OpenAI built-in image generation on 2026-08-31, using
`art-source/spritecook-review/layout-proposal/layout1.png` as the approved
composition and style reference. The miner identity additionally references
`art-source/spritecook-review/miner-cat/miner-cat-v2-128.png`.

- Floor background: empty warm cave, faceted rock walls, timber and lantern;
  no characters, resources, or UI.
- Miner walk: exact 2x2 right-facing loop, stable feet baseline, blue helmet and
  overalls, pickaxe held close, solid `#FF00FF` background.
- Unloader idle: exact 2x2 white/gray apron cat loop, stable feet baseline,
  solid `#FF00FF` background.
- Gold container and pile: separate compact props on solid `#FF00FF`.
- Elevator shaft and cabin: separate empty structural props.
- Elevator cargo cat: exact 2x2 crate-carry idle loop on solid `#FF00FF`.

The first miner and unloader generations failed the strict anchor gate and are
kept only as raw provenance. Their regenerated `v2` sources are the accepted
inputs used by the runtime pack.

Annotation follow-up assets generated on 2026-08-31:

- Elevator cabin v2: one larger-reading 256×256 cabin with a wider interior,
  preserving the existing steel-blue/warm-gold identity.
- Elevator cargo cat v2: exact 2x2 idle grid with a larger body envelope matching
  the floor-cat scale; stable feet and no detached effects.
- Filled gold container: one 256×256 state variant preserving the empty cart's
  silhouette and baseline, with gold visibly heaped above its rim.
- Surface elevator headhouse: one compact 512×512 transparent prop with an open
  cabin bay, visible top gold hopper, and segmented right-side discharge chute.
  The accepted `v2` shortens the first overly tall draft to one cabin height;
  it references the existing cabin/shaft style plus the user-provided hopper
  and chute arrangement.
- Surface warehouse: one 512×512 transparent loading depot with a blue timber
  roof, open gold-storage bay, crates, steel supports, and a right-side loading
  ramp, composed to balance the elevator headhouse without copying its shape.
- Warehouse supervisor: exact 2×2 restrained idle loop of a gray-and-cream cat
  in a gold cap, navy vest, neckerchief, and clipboard. This is a decorative
  surface attendant for Step 32A, not the deferred gameplay Manager system.

All use the existing asset plus `layout1.png` as visual references and a solid
`#FF00FF` processing background. Exact prompts and deterministic QC outputs are
stored in each versioned source directory.

Shared-stage level follow-up generated on 2026-09-01:

- Elevator tower v2 preserves the open bay, top hopper, chute, and tray while
  adding a steel-blue mounting bracket immediately to the tray's right. The
  bracket is the visual anchor for a separate code-rendered Level/Upgrade badge;
  no functional text or icon is baked into the raster asset.
- Source and strict-QC output are stored under
  `art-source/step-32a-asset-pack/elevator-tower-v2/`.

Surface delivery follow-up generated on 2026-09-01:

- Surface hauler cat: exact 2×2 side-view pushing-walk loop of an original
  orange tabby in a yellow hard hat and red-brown overalls. Its forepaws are
  extended toward a cart composed separately at runtime; the sheet contains no
  cart, gold, UI, or scenery.
- Surface gold pour: exact 2×2 FX loop with sparse start, strong cascade, dense
  cascade, and tapering nuggets. Its top emission anchor is stable and the
  receiving cart remains a separate runtime asset.
- Both raw sources use solid `#FF00FF`. Accepted transparent sheets, frames,
  GIF previews, prompts, and strict-QC metadata are stored in the matching
  `surface-hauler-cat/` and `surface-gold-pour/` source directories.
- Surface landscape: a wide low-contrast outdoor plate with blue sky, rounded
  clouds, distant teal mountains/pines, and green meadow. It contains no
  buildings, characters, carts, gold, UI, or functional text. The generated
  source was normalized to 720×328 for a sharp 2× render at 360×164; prompt,
  raw source, and processed runtime output are retained under
  `surface-landscape/`.
