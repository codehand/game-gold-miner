# Forge mining impact — 2026-09-28

- **Generation:** OpenAI built-in image generation. Exact prompt is in
  `prompt-used.txt`: four isolated
  2×2 frames of warm gold ore-impact glints, chips and fading sparks; no
  character, pickaxe, environment, UI or text. Requested flat magenta key;
  the generated PNG instead had native alpha, retained by the processor.
- **Raw / processed:** `raw.png` and `processed/`. Processed with
  `generate2dsprite.py process --target asset --mode impact --rows 2 --cols 2
  --cell-size 128 --fit-scale 0.74 --align center --component-mode all
  --duration 90 --strict-qc`. Four 128×128 RGBA frames passed strict QC and
  native-scale visual review.
- **Runtime copy:** `public/assets/marketplace/runtime/effects/forge-mining-impact-4f-sheet.png`.
  The effect is a separate pooled sprite, visible only after Forge's pickaxe
  reaches the gold pile, and does not enter simulation or save data.
