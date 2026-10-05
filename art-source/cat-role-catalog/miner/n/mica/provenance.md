# Mica — Miner N listing portrait

- **Asset ID:** `miner:N:mica:idle`
- **Role / rarity:** Miner / N baseline
- **Raw source:** `raw/miner-n-mica-idle-raw-v1.png`
- **Generated source:** OpenAI image generation, 2026-09-19; prompt is recorded in `prompt-used.txt`.
- **Processor:** `generate2dsprite.py process`, `npc` / `idle`, exact 2×2 grid, 4 frames, 128×128 output cells, feet alignment, shared scale, strict QC.
- **Listing portrait:** `processed/idle-1.png`
- **Design reference:** `reference/miner-n-mica-design-reference.png`
- **Visual locks:** orange tabby; teal work vest; brass lamp helmet; pickaxe and ore pouch; dark navy outline; upper-left light; no baked UI or rarity text.
- **Review status:** candidate generated and technically validated for Phase 3 preview catalog; a dedicated directional walk sheet and mining-action sheet are now runtime-integrated.

## Mining strike action — 2026-09-28

- **Generation:** OpenAI built-in image generation, with the approved
  `processed/idle-1.png` as Mica's identity/style reference and Forge's
  processed attack sheet only as an action-order reference. The exact prompt
  is preserved in `attack/prompt-used.txt`.
- **Raw / processed:** `attack/raw.png` and `attack/processed/`. Processed by
  `generate2dsprite.py process --target player --mode attack --rows 2 --cols 2
  --cell-size 128 --fit-scale 0.84 --align feet --scale-strategy preserve
  --component-mode largest --duration 140 --strict-qc`. Four 128×128 RGBA
  frames passed strict QC and native-scale visual review.
- **Original runtime copies:**
  `public/assets/marketplace/runtime/miner/mica-4f-sheet.png` was derived from
  the approved idle sheet; the current runtime travel sheet is documented below.
  `public/assets/marketplace/runtime/miner/mica-attack-4f-sheet.png` contains
  the independent swing. Both use the same 75px display box as Forge; the
  shared impact effect stays separate. No generated texture affects core
  production, assignment authority or save data.

## Runtime scale and foot-line correction — 2026-09-28

- The approved catalog idle sheet is unchanged for portraits and previews. Its
  subject measured 92–95 px tall per frame, while Mica's upright strike frames
  measured 76 px and Forge's idle frames measured 74–75 px. This caused an
  obvious apparent scale change whenever Mica started or stopped mining.
- Reprocessed the original `raw/miner-n-mica-idle-raw-v1.png` into
  `idle-runtime/processed/` with the same 2×2/128 px feet-aligned, shared-scale,
  strict-QC pipeline, using `--fit-scale 0.65` instead of the catalog's 0.82.
  The four runtime idle frames now measure 73–75 px tall. The processor's
  fit-scale-dependent foot target was then moved to the attack sheet's shared
  visible foot line (bottom pixel 121) with
  `scripts/align-sprite-sheet-feet.py --cell-size 128 --foot-bottom 121`.
- `idle-runtime/sheet-feet-aligned.png` was the source of the first corrected
  runtime idle copy, later superseded by the directional walk sheet below. No
  per-frame or per-action scale adjustment occurs in Phaser; the intentional
  crouched strike frames remain shorter as part of the swing.

## Directional walk — 2026-09-28

- **Generation:** OpenAI built-in image generation using `processed/idle-1.png`
  as Mica's identity reference and the approved attack sheet as a right-facing
  action/style reference. Exact prompt: `walk-right/prompt-used.txt`.
- **Raw / processed:** `walk-right/raw.png` and `walk-right/processed/`.
  Processed with `generate2dsprite.py process --target player --mode walk
  --rows 2 --cols 2 --cell-size 128 --fit-scale 0.90 --align feet
  --scale-strategy preserve --component-mode largest --duration 220
  --strict-qc`. Four right-facing walking frames passed strict QC. The
  processor's foot line was aligned to bottom pixel 121 with
  `scripts/align-sprite-sheet-feet.py --cell-size 128 --foot-bottom 121`.
- **Current runtime:** `walk-right/sheet-feet-aligned.png` is copied to
  `public/assets/marketplace/runtime/miner/mica-walk-right-4f-sheet.png`.
  Outbound displays the authored right-facing poses; return flips the same
  frames horizontally to face left. Mining still uses the independent attack
  sheet. Catalog art and all simulation/save state remain unchanged.
