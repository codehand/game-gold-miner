# Marketplace preview portraits

Copied from the approved local cat-role art catalog, first stationary idle frame:
- Mofy: art-source/cat-role-catalog/elevator-cargo-cat/ssr/mofy/processed-8f-v2/idle-1.png
- Elon v2: public/assets/marketplace/elon-v2/idle-1.png, generated with generate2dsprite; prompt, raw sheet and QC metadata are in that directory.
- Baron: art-source/cat-role-catalog/warehouse-manager/sr/baron/processed/idle-1.png
- Cipher: art-source/cat-role-catalog/warehouse-manager/sr/cipher/processed/idle-1.png

Source prompts, generated raw sheets and provenance remain in those directories.
These copies are for the marketplace UI preview; they do not assign gameplay roles.

## Phase 1 canonical preview portraits

The Phase 1 registry exposes stable asset IDs and copies the canonical processed
`idle-1` frame into `public/assets/marketplace/catalog/` for browser loading:

- `elevator-cargo-cat:SSR:mofy:idle` →
  `elevator-cargo-cat/ssr/mofy/processed-8f-v2/idle-1.png`
- `elevator-cargo-cat:SSR:elon:idle` →
  `elevator-cargo-cat/ssr/elon/processed/idle-1.png`
- `warehouse-manager:SR:baron:idle` →
  `warehouse-manager/sr/baron/processed/idle-1.png`
- `warehouse-manager:SR:cipher:idle` →
  `warehouse-manager/sr/cipher/processed/idle-1.png`

These outputs are `128×128` transparent RGBA preview portraits. They remain
catalog/preview assets and are not runtime-integrated character assignments.
