# Marketplace preview portraits

## Boru excavator — 2026-09-30

`miner:SSR:boru:idle` uses an original approved calico excavator operator.
Four independent eight-frame sheets (empty travel, scoop/lift, loaded travel,
deposit) share one scale profile and chassis root. Source, exact prompts,
generation IDs and QC: `art-source/cat-role-catalog/miner/ssr/boru/provenance.md`.
Runtime copies: `runtime/miner/boru-*-8f-sheet.png`; portrait:
`catalog/miner/ssr/boru/idle-1.png`. The portrait is independently cropped and
enlarged from empty-travel frame 1 for Marketplace and assignment thumbnails;
the four in-game sheets remain at their original scale. No third-party artwork.

## Hauler expansion — 2026-09-29

`hauler:SR:tobi:walk` and `hauler:SSR:rivet:walk` are original generated
characters with independent 4-frame right-facing walk sheets. Separate 128px
transparent empty/filled cart images preserve the same silhouette. Tobi uses
an electric wheeled trolley; Rivet uses a wheel-free cyan-coil maglev cart.
The runtime copies are in `runtime/hauler/`; portraits use the first walk frame
in `catalog/hauler/`. Raw sheets, transparent exports, animation previews and
strict QC records are in `art-source/cat-role-catalog/hauler/`, with generation
and processing details in its `provenance.md`. No third-party character art.
The free Hauler portrait reuses the existing Step 32A walk-1 frame.

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

## Phase 3 listing portrait expansion

The preview catalog now includes additional distinct Elevator and Warehouse
entries plus the first dedicated Miner family:

- `elevator-cargo-cat:SSR:win:idle` → `catalog/elevator-cargo-cat/ssr/win/idle-1.png`
- `warehouse-manager:SR:gauge:idle` → `catalog/warehouse-manager/sr/gauge/idle-1.png`
- `warehouse-manager:SSR:nautilus:idle` → `catalog/warehouse-manager/ssr/nautilus/idle-1.png`
- `miner:N:mica:idle` → `catalog/miner/n/mica/idle-1.png`
- `miner:SSR:forge:idle` → `catalog/miner/ssr/forge/idle-1.png`

Mica and Forge were generated as original 2×2/4-frame candidates and passed
strict processor QC. Forge remains a Phase 3 preview portrait; its required
premium 4×2/8-frame family is intentionally deferred to Phase 4. All five
entries remain preview-only and `runtimeIntegrated: false`.

## Phase 4 premium animation families

The approved premium catalog now has exact 4×2/8-frame families at 128×128
per frame and 110 ms for Mofy, Win, Elon, Baron, Cipher, Gauge, Nautilus, and
Forge. Mofy's authored 8-frame family was preserved; the other seven were
reconstructed from QC-passed 4-frame candidates with the deterministic
ping-pong sequence `1,2,3,4,3,2,1,2`. The processed source sheets remain in
`art-source/` for provenance; the approved runtime copies are listed below.
Mica stays on the N-tier 2×2/4-frame contract.

## Phase 7 runtime integration

The user-approved runtime selection uses the same stable Marketplace IDs as the
preview catalog and copies only the QC-passed transparent sheets into the
served runtime asset path:

- `elevator-cargo-cat:SSR:mofy:idle` → `runtime/elevator/mofy-8f-sheet.png`
- `warehouse-manager:SR:baron:idle` → `runtime/warehouse/baron-8f-sheet.png`
- `miner:SSR:forge:idle` → `runtime/miner/forge-8f-sheet.png`

The 2026-09-28 miner assignment follow-up also integrates
`miner:N:mica:idle` as `runtime/miner/mica-4f-sheet.png`, with its independent
`runtime/miner/mica-attack-4f-sheet.png`. Forge and Mica select their own
pickaxe sheet from the assigned asset ID and share the separate ore-impact
sheet at `runtime/effects/forge-mining-impact-4f-sheet.png`. Mica's raw action,
exact prompt, processed frames and QC record live under
`art-source/cat-role-catalog/miner/n/mica/attack/`.
The 2026-09-28 scale correction derives Mica's in-world idle copy from the
original raw idle art at a smaller shared scale, then aligns its visible feet
to the strike sheet's baseline. Its reproducible source is
`art-source/cat-role-catalog/miner/n/mica/idle-runtime/sheet-feet-aligned.png`;
the approved catalog portrait and preview idle sheet are unchanged.
The later directional correction supersedes that travel copy with
`runtime/miner/mica-walk-right-4f-sheet.png`, sourced from
`art-source/cat-role-catalog/miner/n/mica/walk-right/sheet-feet-aligned.png`.
All four walk frames face right; the game mirrors them for the leftward return.
The previous idle-runtime copy remains in source history, and the Marketplace
catalog portrait is unchanged.

The free default Elevator operator Pip is deliberately outside the Marketplace
catalog: `public/assets/defaults/elevator/pip-4f-sheet.png` and
`pip-portrait.png` come from the source and provenance under
`art-source/cat-role-catalog/elevator-cargo-cat/n/pip/`. Mofy's runtime sheet
remains available for an owned instance assigned to the Elevator slot, but is
not used as the unassigned default.

These are presentation-only role assignments. They do not enter save data,
change simulation formulas, or imply authoritative ownership. The unloader
role remains on the existing Step 32A fallback because it is future-role art,
not a Marketplace v1 role.
