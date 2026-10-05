# Hauler art — 2026-09-29

Original bitmap art generated with built-in image generation for this game.
Concepts approved by the user: default wooden handcart; SR electric wheeled
trolley; SSR wheel-free maglev. The existing blue steel / brass / warm wood
palette and readable chibi pixel-inspired silhouettes remain the style anchor.

## Assets and generation brief

- Tobi (`hauler:SR:tobi:walk`): warm tan/orange mechanic cat with navy workwear,
  brass details; four consistent side-view right-facing pushing/walking poses.
- Rivet (`hauler:SSR:rivet:walk`): cool silver cat with blue/gold engineer
  outfit, cyan tech accents; same right-facing four-pose walk contract.
- Each cat was generated on a solid-magenta 2×2 raw sheet, no scenery,
  text, frame borders or cart. Keep identity, head/body scale and foot baseline
  consistent; alternate stepping legs while arms remain forward at handle height.
- Each empty cart was generated as an independent side-view object on magenta:
  Tobi's wheeled electric blue/brass trolley, Rivet's wheel-free blue/brass cart
  with cyan magnetic coils. Filled variants were image edits that added gold
  inside the bin while preserving the exact cart silhouette and proportions.

This is a recorded generation brief, not a verbatim transcript of prompts.
Raw originals are retained in every asset directory for reproducibility.

## Processing and validation

Used the `generate2dsprite` processor for chroma removal, extraction, shared
scale/alignment and transparent export only. Walks: target npc, mode walk,
role hauler, rows2/cols2, cell128, fit-scale0.84, feet alignment, shared-scale,
largest component, strict-qc, duration200ms. Carts: target asset, mode single,
role hauler-cart, rows1/cols1, cell128, fit-scale0.84, center alignment, largest
component, strict-qc. All six processing runs passed strict QC.

Each `walk/`, `cart-empty/`, `cart-filled/` directory retains `raw-sheet.png`,
`raw-sheet-clean.png`, transparent output, extracted frames, preview GIF and
`pipeline-meta.json`. Runtime PNGs are exact copies of processed files.
Premium Haulers deliberately use four authored frames (not padded duplicates).
The renderer mirrors cat and cart together on return; Rivet's cart is raised
4 logical pixels. After the 2026-09-30 cart-size feedback, cat display boxes
stay 52px; Tobi/Rivet cart boxes are 64px (default handcarts stay 46px).
Runtime-only origins use the visible bottom of the 128px source: Tobi 95/128,
Rivet 89/128. Both empty/full textures share these anchors, aligned to the
default handcart ground line before Rivet's hover offset. Source PNGs are
unchanged; the adjustment does not rescale or regenerate cat art.

Rivet thrust feedback (2026-09-30): the renderer overlays two procedural
cyan/white jets at source coil anchors (48,89) and (99,89), with soft glow and
smooth cosmetic-clock variation. They mirror with the cart and are not baked
into either PNG; cat/cart source art and processing provenance are unchanged.

Default portrait: exact copy of
`art-source/step-32a-asset-pack/surface-hauler-cat/processed/walk-1.png`.
