# Forge — Miner SSR listing portrait

- **Asset ID:** `miner:SSR:forge:idle`
- **Role / rarity:** Miner / SSR premium candidate
- **Raw source:** `raw/miner-ssr-forge-idle-raw-v1.png`
- **Generated source:** OpenAI image generation, 2026-09-19; prompt is recorded in `prompt-used.txt`.
- **Processor:** `generate2dsprite.py process`, `npc` / `idle`, exact 2×2 grid, 4 frames, 128×128 output cells, feet alignment, shared scale, strict QC.
- **Listing portrait:** `processed/idle-1.png`
- **Design reference:** `reference/miner-ssr-forge-design-reference.png`
- **Visual locks:** charcoal-gray fur; emerald eyes; plum coat with restrained gold trim; brass lamp helmet; crystal-tipped pickaxe; dark navy outline; upper-left light; no baked UI or rarity text.
- **Review status:** candidate generated and technically validated for the Phase 3 preview catalog; the Phase 4 premium family is reconstructed and QC-passed; runtime integration remains false.

## Premium 8-frame reconstruction — Phase 4

- Reconstructed from Forge's approved 4-frame processed candidate with
  deterministic ping-pong order `1,2,3,4,3,2,1,2`.
- Output: `processed-8f/`, exact 4×2 grid, eight 128×128 RGBA frames, 110 ms,
  strict QC passed with zero empty, edge-touch, or clamped frames.
- The Phase 3 listing portrait remains `processed/idle-1.png`; runtime
  integration is deferred.
