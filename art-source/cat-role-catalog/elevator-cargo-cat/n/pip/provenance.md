# Pip — free Elevator operator

- Original artwork: generated with OpenAI image generation on 2026-09-28, using the existing Mofy design reference for game style only. Pip is a distinct silver-gray tabby worker, not a Marketplace sale item.
- Raw 2×2 sheet: `idle/raw.png`; exact generation prompt: `idle/prompt-used.txt`.
- Deterministic processing: `generate2dsprite.py process --input art-source/cat-role-catalog/elevator-cargo-cat/n/pip/idle/raw.png --target player --mode idle --output-dir art-source/cat-role-catalog/elevator-cargo-cat/n/pip/idle/processed --rows 2 --cols 2 --cell-size 128 --fit-scale 0.9 --align feet --scale-strategy preserve --component-mode largest --duration 220 --strict-qc --max-body-scale-cv 0.08 --max-anchor-y-std 0.05`.
- Runtime sheet: `public/assets/defaults/elevator/pip-4f-sheet.png`; assignment portrait: `public/assets/defaults/elevator/pip-portrait.png`.
- QA: four valid frames, no empty or edge-touching frames, no clamped pastes, body-scale CV 0.0028. Each frame shares the 128 px cell and feet anchor. Native-scale game inspection is tracked in the implementation gate.
- Runtime contract: Pip represents an unassigned `elevator:main` visually and grants no owned cat, rarity/skill bonus, or Marketplace entitlement. An owned, assigned Mofy replaces Pip; the prior Mofy sprite remains intact.
