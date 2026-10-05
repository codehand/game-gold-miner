# Forge — Miner SSR listing portrait

- **Asset ID:** `miner:SSR:forge:idle`
- **Role / rarity:** Miner / SSR premium candidate
- **Raw source:** `raw/miner-ssr-forge-idle-raw-v1.png`
- **Generated source:** OpenAI image generation, 2026-09-19; prompt is recorded in `prompt-used.txt`.
- **Processor:** `generate2dsprite.py process`, `npc` / `idle`, exact 2×2 grid, 4 frames, 128×128 output cells, feet alignment, shared scale, strict QC.
- **Listing portrait:** `processed/idle-1.png`
- **Design reference:** `reference/miner-ssr-forge-design-reference.png`
- **Visual locks:** charcoal-gray fur; emerald eyes; plum coat with restrained gold trim; brass lamp helmet; crystal-tipped pickaxe; dark navy outline; upper-left light; no baked UI or rarity text.
- **Review status:** candidate generated and technically validated for the Phase 3 preview catalog; the Phase 4 premium family is reconstructed, QC-passed, and runtime-integrated.

## Premium 8-frame reconstruction — Phase 4

- Reconstructed from Forge's approved 4-frame processed candidate with
  deterministic ping-pong order `1,2,3,4,3,2,1,2`.
- Output: `processed-8f/`, exact 4×2 grid, eight 128×128 RGBA frames, 110 ms,
  strict QC passed with zero empty, edge-touch, or clamped frames.
- The Phase 3 listing portrait remains `processed/idle-1.png`; runtime
  integration uses the eight-frame idle sheet.

## Mining strike action — 2026-09-28

- **Generation:** OpenAI built-in image generation, using `processed/idle-1.png`
  as a strict visual identity reference. Exact prompt is in `attack/prompt-used.txt`:
  four 2×2 right-facing poses
  (wind-up, downswing, contact, recovery), same charcoal fur, emerald eyes,
  plum/gold coat, brass lamp helmet, blue crystal pickaxe, and flat magenta
  chroma background; no gold/particles/environment/text.
- **Raw / processed:** `attack/raw.png` and `attack/processed/`. Processed by
  `generate2dsprite.py process --target player --mode attack --rows 2 --cols 2
  --cell-size 128 --fit-scale 0.84 --align feet --scale-strategy preserve
  --component-mode largest --duration 140 --strict-qc`. Four 128×128 RGBA
  frames passed strict QC and native-scale visual review.
- **Runtime copy:** `public/assets/marketplace/runtime/miner/forge-attack-4f-sheet.png`.
  The existing eight-frame idle sheet remains the travel animation; attack
  frames play only while Forge stops at the gold pile.
