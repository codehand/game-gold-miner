# Marketplace Asset Implementation Plan — Approved Draft

**Status:** Approved draft for implementation planning, 2026-09-19. The phase
sequence, asset gates, role-taxonomy gate, and premium 8-frame requirements are
approved as the working plan; individual asset approval remains subject to the
phase validation gates.

**Execution status:** Phase 0 — complete and verified 2026-09-19. Phase 1 —
not started. No later phase may begin until its predecessor's validation gate
passes.

**Scope:** Asset production and asset-facing integration for Marketplace v1.
This plan covers portraits, role/attribute presentation, premium animation
families, asset identity, validation, and later runtime integration. It does
not authorize live marketplace transactions, economy changes, ownership
storage, or database migrations.

**Story contract:** The Marketplace is the Cat Miners Guild exchange. A cat is
a certified mine specialist whose role, rarity, attributes, and skill profile
are inspected before a player buys or rents its contract. Art must communicate
the cat's job and rarity without relying on baked text or UI labels.

## 1. Source documents and current inputs

The plan is derived from:

- `memory-bank/marketplace-spec-v1-draft.md` — story, ownership states,
  attributes, role scores, and skill benefits.
- `art-source/cat-role-catalog/art-direction-brief.md` — visual system,
  technical frame, naming, animation policy, and approval gates.
- `art-source/cat-role-catalog/asset-manifest.json` — existing candidates,
  roles, rarity tiers, provenance, and QC records.
- `src/ui/MarketplaceModal.ts` — current preview tabs, sample listings,
  portrait loading behavior, and 1–24 hour rental UI.
- `public/assets/marketplace/provenance.md` — current preview portrait
  provenance.

Current visual and runtime constraints:

- Phaser 4.2.1, 2D raster assets, portrait game viewport 360×640.
- Clean-HD cartoon rendering with rounded silhouettes, dark navy outlines, and
  a shared upper-left light direction.
- Runtime sprite frame size: `128×128`, transparent RGBA.
- N/R animation policy: exact 2×2 sheet, 4 frames.
- SR/SSR/UR animation policy: exact 4×2 sheet, 8 frames.
- Current role asset display boxes remain role-specific; the elevator cargo cat
  is more compact than surface/floor attendants.
- Text, prices, numbers, stat labels, and interaction state remain code-native.

## 2. Non-negotiable planning rules

1. **Inspect before inventing.** Existing approved or candidate assets are the
   visual seed for related variants. Do not generate an unrelated art family.
2. **Role must read from silhouette and prop.** An Elevator cat must read as a
   cargo/transport specialist; Warehouse must read as inventory management;
   Miner must read as extraction. Do not reuse an Unloader asset as Miner
   without an explicit product decision.
3. **Rarity is an accent system.** Use the approved gray/green/blue/purple/gold
   identities through costume, trim, gems, props, and restrained effects. Do
   not tint the whole character.
4. **No baked UI.** Do not bake role names, rarity codes, prices, stat values,
   badges, frames, buttons, or labels into character assets.
5. **One canonical identity.** Runtime, Marketplace cards, detail previews, and
   future ownership screens refer to a stable `assetId`, not a display name or
   raw path.
6. **Asset-only stages stay asset-only.** Candidate generation and review must
   not change simulation, save state, ownership, balance, or transaction
   behavior.
7. **Every phase has a gate.** An asset is not production-ready because a
   generated image looks good. It must pass raster QC, native-scale review,
   context review, provenance recording, and the phase's story contract.

## 3. Role taxonomy gate

This is the first decision gate because the approved Marketplace v1 draft uses
`Elevator`, `Warehouse`, and `Miner`, while the current asset catalog contains
`elevator-cargo-cat`, `warehouse-manager`, and `unloader`.

### Current mapping

| Product role | Existing canonical asset family | Current status |
| --- | --- | --- |
| Elevator | `elevator-cargo-cat` | Existing Mofy, Win, and Elon candidates |
| Warehouse | `warehouse-manager` | Existing Baron, Cipher, Gauge, and Nautilus candidates |
| Unloader | `unloader` | Existing Aegis, Zenith, Sovereign, and Tally candidates |
| Miner | No dedicated catalog family | Must be generated or deferred |
| Surface elevator tower | `surface-elevator-tower` | Environment/role prop, not a cat listing |

### Recommended decision

Keep `Miner` in Marketplace v1 and create a dedicated `miner` asset family.
Keep `unloader` as a separate role unless the product changes the simulation
spec first. This preserves the distinction between:

- an underground extraction specialist;
- a floor-head receiving attendant; and
- an elevator cargo steward.

If the product instead chooses `Unloader` over `Miner`, update the Marketplace
v1 spec and role-score table before Phase 3. No new Miner assets should be
generated while this decision is unresolved.

### Phase 0 gate

**Input:** Marketplace v1 draft, current asset manifest, runtime role names,
and current Marketplace filters.

**Output:** Approved role matrix containing, for every role:

- product-facing role name;
- canonical `roleId`;
- story/job read;
- supported rarity tiers;
- asset family path;
- runtime display box;
- whether the role is Marketplace v1 or future-only.

**Validation:**

- No product role maps to two incompatible job reads.
- No asset family is silently renamed or repurposed.
- The role matrix agrees with the Marketplace v1 score weights.
- The `Miner`/`Unloader` decision is recorded before generation starts.

**Exit gate:** Product and art direction approval. Phase 3 and Phase 4 cannot
start for an unresolved role.

## 4. Phase 1 — Canonical asset registry and technical normalization

### Goal

Make the current Marketplace portraits and catalog candidates addressable by
stable identity and compatible with one technical frame.

### Inputs

- Existing public portraits: Mofy, Elon, Baron, and Cipher.
- Canonical processed sources under `art-source/cat-role-catalog/`.
- Approved role matrix from Phase 0.
- Existing provenance files and manifest entries.

### Work

- Define the stable asset ID format:

  ```text
  <roleId>:<rarityTier>:<characterSlug>:<animation>
  ```

  Examples:

  ```text
  elevator-cargo-cat:SSR:mofy:idle
  warehouse-manager:SR:baron:idle
  ```

- Use the canonical processed `idle-1` as the listing portrait source.
- Normalize portrait output to transparent RGBA with `128×128` dimensions,
  stable feet baseline, and consistent padding.
- Preserve backward-compatible public paths while the Marketplace UI still
  uses its sample-name resolver.
- Add an allowlisted asset registry for the future UI instead of resolving a
  server-provided display name into a file path.
- Reconcile the manifest with the current Mofy 8-frame result. The current
  focus records Mofy as an exact 4×2/8-frame asset, while older manifest fields
  may still describe the pre-update 2×2/4-frame candidate.
- Keep generated raw sheets, processed sheets, previews, prompts, and
  provenance in the role/tier source folder.

### Outputs

- Canonical portrait files for Mofy, Elon, Baron, and Cipher.
- Stable asset registry entries and IDs.
- Updated manifest metadata for approved technical facts.
- A compatibility map from current UI paths to canonical asset IDs.
- Contact sheet containing all current Marketplace portraits at native scale.

### Validation

- Every portrait is exactly `128×128`, RGBA, and has usable alpha.
- No baked text, labels, preview chrome, duplicated characters, or signatures.
- No clipped body, edge-touching subject, or inconsistent baseline.
- Mofy preserves the approved 8-frame source while its card portrait remains a
  single idle frame.
- Public portrait appearance remains unchanged unless separately approved.
- Contact sheet and 360×640 context preview show consistent scale and role read.

**Exit gate:** Existing preview portraits are technically canonical and can be
resolved by asset ID without changing gameplay.

## 5. Phase 2 — Marketplace presentation icon family

### Goal

Provide the non-character visuals needed to explain role, rarity, attributes,
skills, and availability. These should mostly be vector or code-native assets,
not generated raster illustrations.

### Inputs

- Four v1 attributes: `Power`, `Speed`, `Capacity`, `Efficiency`.
- Role score weights for Elevator, Warehouse, and Miner.
- Rarity identities: N gray, R green, SR blue, SSR purple, UR gold.
- Existing Marketplace card/detail layout and mobile viewport constraints.

### Outputs

#### Role icons

- Elevator: cabin, pulley, or vertical transport silhouette.
- Warehouse: crate, inventory ledger, or storage stack.
- Miner: pickaxe/ore silhouette after the Phase 0 role decision.
- Optional future Unloader: receiving tray/container icon.

#### Attribute icons

- Power: pickaxe/impact/strength mark.
- Speed: motion lines or bolt.
- Capacity: cart/crate/load mark.
- Efficiency: gear/check/flow mark.

#### Skill and state icons

- Primary role-skill icon for Lift Mastery, Storage Mastery, and Mining Mastery.
- Idle, Assigned, Listed, Rented, Locked, and Rental-expiring states.

#### Rarity presentation

- Code-rendered rarity chip and border/accent rules.
- Optional SVG corner mark or gem shape.
- No rasterized rarity text.

### Technical target

- SVG or code-native geometric icons where possible.
- 24×24 and 32×32 logical-size variants where a raster export is required.
- Normal, selected, disabled, warning, and focus-visible states.
- Shared navy outline, rounded geometry, and restrained gold/blue/purple
  accents matching the existing UI.

### Validation

- Icons remain distinguishable at 24×24 on a 360×640 viewport.
- Color is not the only signal for rarity or state.
- Text and numbers remain live DOM/code text.
- Role icons do not imply the wrong job.
- All states are legible over the existing dark navy modal background.
- No horizontal overflow or card-height instability is introduced.

**Exit gate:** A player can identify role, rarity, four attributes, primary
skill, and cat availability without reading a long paragraph.

## 6. Phase 3 — Listing portrait catalog expansion

### Goal

Create enough distinct catalog entries for Marketplace v1 to feel like a
specialist exchange rather than four demo cards.

### Inputs

- Approved role matrix.
- Existing character seeds and art direction locks.
- Marketplace v1 rarity and role filters.
- Attribute/skill data model from the Marketplace v1 draft.

### Minimum launch catalog

The target is a catalog of reusable character blueprints, not one image per
owned cat instance.

| Role | Existing candidates to retain | Minimum additional work |
| --- | --- | --- |
| Elevator | Mofy, Win, Elon — SSR | Add/approve at least one N or R baseline if live listings need non-premium supply |
| Warehouse | Baron, Cipher, Gauge — SR; Nautilus — SSR | Add/approve at least one N or R baseline if live listings need non-premium supply |
| Miner | None | Create 2–3 initial characters after the role gate; include a baseline and at least one premium tier |
| Unloader | Aegis, Zenith, Sovereign — SSR; Tally — UR | Keep catalog-only unless Unloader is approved as a Marketplace role |

One character blueprint may support many owned instances with different level,
attributes, skills, owner, listing price, or rental state. The image identity
must not be used as the ownership identity.

### Per-character outputs

- Design reference and visual locks.
- Transparent idle portrait.
- Canonical asset ID.
- Role and rarity metadata.
- Single-frame listing portrait.
- Context preview showing the correct job read.
- Provenance record.
- Stat/skill data fixture used only for preview and testing, not hidden in the
  image.

### Validation

- The character is recognizable at card scale before detail text is read.
- Role prop and silhouette agree with the story.
- Rarity is visible through approved accents, not full-body tint.
- Two characters in the same role remain visually distinct.
- Portraits share baseline, camera, outline, light direction, and detail density.
- Listing data can reference the asset by ID without using character name as a
  path or security boundary.

**Exit gate:** Marketplace has enough approved portraits to exercise role,
rarity, search, filter, comparison, and rental scenarios.

## 7. Phase 4 — Premium 8-frame animation families

### Goal

Produce or normalize the premium animation assets required by the catalog's
SR/SSR/UR policy. These animations are presentation assets; frame count does
not grant a gameplay benefit.

### Shared 8-frame contract

Every final SR/SSR/UR animation listed below must have:

- exact 4×2 grid;
- 8 frames;
- 128×128 pixels per frame;
- transparent RGBA output;
- stable bottom-center anchor and role-specific display scale;
- a deliberate loop: neutral, preparation, action peak, follow-through,
  recovery, secondary prop/costume motion, settle, return;
- timing recorded in manifest and previewed in context;
- no baked text, labels, UI, detached effect cloud, or unrelated scenery.

### Priority A — Elevator cargo cats

| Asset ID | Current state | Planned output |
| --- | --- | --- |
| `elevator-cargo-cat:SSR:mofy:idle` | 8-frame result exists; strict QC recorded | Finalize manifest/source metadata, preserve the approved ledger-inspection motion, keep 128×128 idle portrait |
| `elevator-cargo-cat:SSR:win:idle` | 4-frame candidate | Generate or reconstruct an exact 8-frame sheet; preserve cloud collar, locked ledger, keyhole, and electrical motif |
| `elevator-cargo-cat:SSR:elon:idle` | 4-frame candidate plus separate high-resolution preview derivatives | Generate or reconstruct an exact 8-frame canonical sheet; preserve celestial cube, moon trim, and compact elevator silhouette |

### Priority B — Warehouse managers

| Asset ID | Current state | Planned output |
| --- | --- | --- |
| `warehouse-manager:SR:baron:idle` | 4-frame candidate and public portrait | Produce exact 8-frame SR sheet; use scroll/ledger adjustment as the action beat |
| `warehouse-manager:SR:cipher:idle` | 4-frame candidate and public portrait | Produce exact 8-frame SR sheet; use holographic inventory inspection as the action beat |
| `warehouse-manager:SR:gauge:idle` | 4-frame candidate | Produce exact 8-frame SR sheet; use mechanical clipboard/gear check as the action beat |
| `warehouse-manager:SSR:nautilus:idle` | 4-frame candidate | Produce exact 8-frame SSR sheet; use shell ledger/archive inspection as the action beat |

### Priority C — Unloader catalog candidates

Only execute this group if Unloader is approved as a Marketplace role or is
needed for a future role catalog release:

| Asset ID | Current state | Planned output |
| --- | --- | --- |
| `unloader:SSR:aegis:idle` | 4-frame candidate | Exact 8-frame receiving/inspection loop |
| `unloader:SSR:zenith:idle` | 4-frame candidate | Exact 8-frame weighing/receiving loop |
| `unloader:SSR:sovereign:idle` | 4-frame candidate | Exact 8-frame regal receiving loop |
| `unloader:UR:tally:idle` | 4-frame candidate | Exact 8-frame rune/receiving loop with restrained UR gold treatment |

### Priority D — Miner family

Only execute after Phase 0 approves `Miner`:

- At least one N/R baseline animation using the 2×2/4-frame policy.
- At least one SR or SSR specialist using the 4×2/8-frame policy.
- Additional character(s) only after the first Miner seed passes native-scale
  role-read review.
- The action beat must communicate extraction: compact pick swing, ore check,
  or cargo preparation. Do not copy the Unloader receiving pose.

### 8-frame validation

For every sheet:

- Raster report confirms exact dimensions and alpha.
- Empty frames: `0`.
- Source/output edge-touch frames: `0`.
- Paste-clamped frames: `0`.
- Body scale and anchor drift are recorded and remain within the approved
  catalog baseline. Mofy's 8-frame result is the reference, not an excuse to
  accept visible drift.
- Contact sheet shows stable identity, costume, prop, and baseline.
- Animation preview shows no foot sliding, costume popping, or prop teleport.
- 360×640 context preview confirms the character reads at actual game scale.
- The loop remains a cosmetic idle/action loop and does not imply a hidden
  gameplay effect.

**Exit gate:** Every approved premium catalog row has a canonical 8-frame
sheet, extracted portrait, manifest record, and provenance record.

## 8. Phase 5 — Marketplace asset registry and UI application

### Goal

Apply canonical assets to the Marketplace preview without coupling external
listing data to filesystem paths or character names.

### Inputs

- Approved asset registry from Phases 1–4.
- Role/attribute/state icon family from Phase 2.
- Existing `MarketplaceModal` behavior and E2E contract.

### Outputs

- Asset registry lookup by stable `assetId`.
- Listing cards using canonical idle portraits.
- Detail view using the portrait and, when available, the approved animation.
- Role, rarity, attribute, skill, and availability presentation.
- Fallback asset for missing/unapproved catalog entries.
- Lazy loading for animation/detail assets; cards should not decode every
  premium sheet at Marketplace open.
- Existing sample listings migrated from name-based paths to registry entries.

### Required behavior

- `assetId` is allowlisted and mapped locally; display name is text only.
- A missing image does not break the card layout or modal close behavior.
- A preview portrait never implies that the viewer owns that cat.
- Buy/rent cards use the same cat portrait; transaction state is expressed by
  code-native badges and text.
- The UI continues to work offline with the existing preview catalog.
- Live server listing data must not directly choose arbitrary image paths.

### Validation

- Existing Marketplace E2E flows still pass: open, search, role filter, rent
  duration, draft listing, responsive viewport, and Escape close.
- Tests cover every approved asset ID and the missing-asset fallback.
- No broken image, horizontal overflow, or card-height jump at 390×844 and
  320×568.
- Detail animation is lazy-loaded and does not delay Marketplace open.
- Native-scale screenshot review confirms icon, portrait, stat, and rarity
  hierarchy.

**Exit gate:** Marketplace preview can display the approved catalog and explain
role/rarity/skill without changing authoritative game state.

## 9. Phase 6 — Listing and transaction state presentation

### Goal

Apply visual state overlays consistently with the ownership rules from the
Marketplace v1 spec.

### Inputs

- Asset registry and state icon family.
- Authoritative listing/state contract when backend work is approved.
- Cat state transitions: Idle, Assigned, Listed, Rented, Expired.

### Outputs

- `Assigned` cat cannot show an active sell/rent CTA.
- `Listed` cat shows listing state and cannot show an assign CTA.
- `Rented` cat shows owner/renter context and expiry time.
- `Expired` rental returns to the owner portrait with an explicit result state.
- Locked special-role states show the reason using code-native UI.

No separate character sprite is required for each transaction state. State is
data plus overlay UI; the cat identity asset remains stable.

### Validation

- Every visual state maps one-to-one to an allowed lifecycle state.
- No state overlay claims ownership transfer before the authoritative response.
- Failed or rejected transactions return to the correct portrait and state.
- Offline mode displays a non-authoritative preview state rather than implying
  that a transaction succeeded.

**Exit gate:** The visual language cannot suggest that a cat is simultaneously
  assigned, listed, or rented in violation of the story/system contract.

## 10. Phase 7 — Optional in-world runtime integration

### Goal

After the Marketplace asset catalog is approved, apply selected cat assets to
the appropriate mine role without changing simulation authority.

### Inputs

- Approved role-specific sheets from Phase 4.
- Runtime role display boxes and anchors.
- Authoritative assigned-cat state from the future roster/transaction system.

### Outputs

- Elevator cats render inside the elevator cabin at compact scale.
- Warehouse cats render at the warehouse role position.
- Miner cats render in mine floors with a distinct extraction pose.
- Unloader cats remain at the floor-head receiving position.
- Cosmetic animation is driven by the presentation clock only.

### Validation

- The same cat retains identity between Marketplace portrait, detail view, and
  mine placement.
- No renderer object, sprite, frame, or animation state enters save data.
- Role assignment changes visual presentation but does not silently change
  simulation formulas outside the approved role-benefit contract.
- Anchors, scale, baseline, and prop readability remain stable while scrolling.
- Offline boot remains playable and does not require the asset server.

**Exit gate:** Runtime integration is explicitly approved as a separate
milestone. Asset production alone does not authorize replacing current default
runtime sprites.

## 11. Phase 8 — Release audit and provenance

### Inputs

- Final approved assets and icon files.
- Manifest, prompts, references, QC reports, and provenance records.
- Marketplace screenshots and test output.

### Outputs

- Manifest entries marked `approved` or `runtime-integrated` only when the
  corresponding gate passed.
- Stable source and public paths.
- Contact sheets for all roles and rarity tiers.
- Provenance record for every shipped file, including generated source,
  reference, edit history, and license/usage constraints.
- A release checklist that separates catalog-only candidates from shipped
  runtime assets.

### Validation

- No generated candidate is copied into production paths without approval.
- Every public asset has a matching manifest/provenance record.
- Asset IDs resolve uniquely.
- No source file contains secrets, user data, or private credentials.
- Build, lint, Marketplace E2E, raster QC, and native-scale visual review pass.

## 12. Dependency and gate summary

```text
Phase 0: role taxonomy and asset matrix
    ↓
Phase 1: canonical registry and existing portrait normalization
    ├── Phase 2: role/stat/state icon family
    └── Phase 3: listing catalog expansion
            ↓
        Phase 4: premium 8-frame families
            ↓
        Phase 5: Marketplace asset/UI application
            ↓
        Phase 6: transaction-state presentation
            ↓
        Phase 7: optional in-world runtime integration
            ↓
        Phase 8: release audit and provenance
```

Phase 2 can proceed in parallel with Phase 1 after the v1 attributes and role
matrix are approved. Phase 4 cannot be considered complete for a role until
the role's seed and story read are approved. Phase 5 may use static portraits
before every animation family is complete, but it must not pretend that a
missing animation is an approved premium runtime asset.

## 13. Draft acceptance checklist

The asset implementation plan is ready to execute when:

- `Miner` versus `Unloader` is resolved.
- The launch role/rarity matrix is approved.
- The four attributes and role skill names match the Marketplace v1 draft.
- Current public portraits are mapped to stable asset IDs.
- The 8-frame list is approved, including which candidates are catalog-only.
- The product accepts portrait-first Marketplace integration.
- Runtime replacement remains a separate approval gate.
