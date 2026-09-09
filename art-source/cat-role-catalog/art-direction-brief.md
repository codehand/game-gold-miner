# Cat Role Asset Catalog — Art Direction Brief

## Purpose and current boundary

This catalog defines visual variants for gameplay cat roles. Every role has five
ordered rarity tiers. The catalog is currently **asset-only**: it records art,
metadata, references, and review status without changing game state, balance,
production, upgrades, persistence, or save schemas.

The existing `unloader` is the first registered role. Its current Step 32A
sprite remains the runtime default and is the baseline candidate for the
normal (`N`) variant. Adding catalog entries must not replace that runtime asset
until a later gameplay-integration milestone is explicitly approved.

## Rarity taxonomy

The rarity order is fixed:

| Order | Code | Vietnamese name | English working name | Visual color identity |
|---:|---|---|---|---|
| 1 | `N` | Bình thường | Normal | Xám / gray |
| 2 | `R` | Hiếm | Rare | Xanh lá / green |
| 3 | `SR` | Siêu hiếm | Super Rare | Xanh dương / blue |
| 4 | `SSR` | Siêu siêu hiếm | Super Super Rare | Tím / purple |
| 5 | `UR` | Siêu cấp hiếm | Ultra Rare | Vàng / gold |

These colors are semantic rarity identities, not permission to recolor an
entire character. Exact palette values, placement, materials, effects, and
costume changes are locked per asset after inspecting the supplied reference.
Each tier may later have different gameplay attributes, but attribute names,
values, formulas, acquisition, and progression are intentionally undefined.

In code and metadata, use `rarityTier` for this classification so it cannot be
confused with the existing numeric mine-shaft, elevator, or warehouse `level`.

## Stable asset identity and naming

- Role IDs use kebab-case English semantic names, beginning with `unloader`.
- Rarity codes in metadata remain uppercase: `N`, `R`, `SR`, `SSR`, `UR`.
- Source folder convention for a tier with one historical candidate:
  `art-source/cat-role-catalog/<role-id>/<tier>/`.
- When a tier contains multiple named characters, additional candidates use
  `art-source/cat-role-catalog/<role-id>/<tier>/<character-slug>/` so one
  character never overwrites another.
- Proposed runtime filename convention:
  `<role-id>-<tier-lowercase>-<character-slug>-<animation>-sheet.png`.
- Stable named-asset ID convention:
  `<role-id>:<tier>:<character-slug>:<animation>`.
- A role/tier/reference submission creates source candidates first. Nothing is
  production-ready until it passes normalization, native-scale review, motion
  review, and explicit approval.

## Invariants for the asset family

Unless a supplied reference explicitly establishes a different approved role
silhouette, preserve the current Cat Mine Idle character language:

- friendly, rounded, large-headed cat proportions with short readable limbs;
- clean soft-edged cartoon rendering that remains legible in a 360×640 view;
- full-body framing with stable bottom-center feet alignment;
- consistent camera angle, light direction, detail density, and body scale;
- transparent runtime output with no baked text, rarity label, UI chrome,
  scenery, signature, or duplicated character;
- rarity must read at native game scale through deliberate accents and
  silhouette/costume details, not through a weak full-body tint alone.

For the `unloader` role, preserve its job read: a stationary floor-head receiving
attendant beside the gold container. The current baseline is a white/gray cat in
a dark apron with a restrained four-frame idle.

The code-facing `warehouseManager` role is catalogued under the canonical
kebab-case ID `warehouse-manager`. Preserve its job read as a stationary surface
warehouse supervisor holding an inventory clipboard or data tablet. The current
Step 32A gray-and-white cat with a blue vest, yellow cap, and clipboard remains
the runtime default and the normal (`N`) baseline.

The code-facing `elevatorCargoCat` role is catalogued under the canonical
kebab-case ID `elevator-cargo-cat`. Preserve its job read as a compact cargo
steward riding inside the elevator cabin, with its parcel, crate, or cargo
ledger held close to the torso. The current Step 32A orange tabby with a blue
cap, blue shirt, and wooden crate remains the runtime default and the normal
(`N`) baseline.

The first `elevator-cargo-cat:SSR` candidate is named **Mofy**. Mofy locks a
calico black/orange/cream-white coat with split face markings, mint-green eyes,
a long calico tail, a leaf-shaped cloak, and a carved wooden cargo ledger with
a small contained flower motif. Royal-violet and deep-purple cloth plus a
faceted amethyst neck gem carry the SSR identity. Gold remains restrained trim,
while mint is a character accent confined to the eyes and ledger. Detached
wisps are excluded so the silhouette stays clean inside the narrow cabin.

The second `elevator-cargo-cat:SSR` candidate is named **Win**. Win locks a
warm golden-orange tabby with darker stripes, cream chest and muzzle, pale
luminous eyes, pink nose, long striped tail, a thick white cloud collar, and an
ornate locked cargo ledger with a prominent keyhole. Royal-violet cloak cloth
and a faceted amethyst neck gem carry the SSR identity; restrained gold
lightning trim and a small ledger-bound white-gold shimmer preserve Win's
electrical motif. Floating lightning symbols are excluded for cabin clarity.

The third `elevator-cargo-cat:SSR` candidate is named **Elon**. Elon locks an
elegant silver-white tabby with cool-gray stripes, icy luminous eyes, a long
silver striped tail, high ceremonial collar, moon-phase trim, and a compact
cool-glowing celestial cargo cube held in both paws. Royal-violet cloak cloth
and an oval amethyst neck gem carry the SSR identity; pale-gold moon trim and
the white-blue cube glow remain character accents. Detached stars are excluded,
and the cube uses abstract celestial glyph shapes without readable text or
brand marks.

The first `warehouse-manager:SR` candidate is named **Cipher**. Cipher locks a
sleek charcoal-black cat, large pale-gold eyes, long curved tail, segmented
futuristic manager armor, and a transparent holographic inventory tablet held
close to the torso. Sapphire/electric-blue armor panels and cyan tablet light
carry the SR color identity, while gold remains restrained secondary trim. The
tablet may contain abstract chart marks but never readable text or numbers.

The second `warehouse-manager:SR` candidate is named **Baron**. Baron locks a
fluffy cream long-haired cat, pale-gold eyes, pink nose, plume-like tail,
formal ivory-and-gold ceremonial armor, and an ornate golden inventory scroll
held diagonally across the torso. Sapphire-blue sash, belt, and cloth accents
carry the SR identity. The physical ledger silhouette differentiates Baron
from Cipher's futuristic holographic tablet while preserving the same warehouse
supervisor role read.

The third `warehouse-manager:SR` candidate is named **Gauge**. Gauge locks a
warm orange tabby with darker stripes, pale-gold eyes, long striped tail,
practical olive-gray warehouse field coat with utility pockets, layered steel
shoulder protection, and a brown-and-gold mechanical inventory clipboard with
a gear emblem. A sapphire-blue neck scarf and restrained cyan highlights carry
the SR identity. Gauge's mechanical field-supervisor silhouette differentiates
it from Cipher's holographic analyst and Baron's ceremonial ledger keeper.

The first `warehouse-manager:SSR` candidate is named **Nautilus**. Nautilus
locks an elegant charcoal-black cat with a slightly angular face, tall ears,
glowing aqua eyes, long thin tail, ocean-wave ceremonial cloak, and a compact
golden shell-shaped inventory ledger. Royal-violet and deep-amethyst cloth plus
an amethyst neck gem carry the SSR identity; aqua eyes and the shell ledger
remain distinctive accents. Its maritime archivist silhouette differentiates
Nautilus from the blue-signalled SR warehouse supervisors.

The first `unloader:UR` candidate is named **Tally**. Tally locks a dark navy-black cat, amber eyes,
luminous gold facial/costume runes, ornate gold-trimmed cloak/armor, and a
compact teal-crystal pickaxe held close to the torso. Its gold trim and runes
carry the UR color identity at native scale. Detached crystals and aura effects
are excluded from the body sheet so the silhouette, alpha cleanup, and fixed
128×128 frame contract remain stable.

The first `unloader:SSR` candidate is named **Aegis**. Aegis locks silver-gray
tabby fur, a white muzzle/belly/paws, pale-gold eyes, ornate gold ceremonial
armor, welcoming empty paws, a deep-violet cape and inlays, and a faceted
amethyst chest gem. Purple cloth and amethyst carry the SSR identity, while gold
is retained as a secondary armor material so Aegis remains visually distinct
from Tally's gold-signalled UR design.

The second `unloader:SSR` candidate is named **Zenith**. Zenith locks a cream
Siamese body with dark brown ears/mask/paws/tail, pale-gold eyes, pink paw pads,
a deep-violet celestial coat/cape, gold constellation and moon ornaments, a
faceted amethyst forehead gem, and compact connected gold balance scales. The
amethyst and purple cloth carry SSR; the weighing prop distinguishes Zenith
from Aegis while reinforcing the floor-head receiving role.

The third `unloader:SSR` candidate is named **Sovereign**. Sovereign locks a
warm-tan long-haired lynx-like cat with a large cream mane, tall tufted ears,
dark reddish-brown facial and tail markings, glowing pale-gold eyes, open
receiving paws, and an ornate treasure chest worn securely behind the shoulders.
Royal-violet cloth and an amethyst belt gem carry SSR, while the gold belt,
embroidery, and chest remain secondary materials. The attached chest makes the
unloading/cargo role legible while keeping Sovereign distinct from Aegis and
Zenith.

## Technical frame

The current `unloader` baseline establishes the initial technical target:

- Phaser 4, 2D raster sprite sheet;
- four-frame idle in an exact 2×2 grid;
- 128×128 pixels per frame, 256×256 sheet;
- transparent RGBA runtime output;
- stable feet baseline and body scale across all frames;
- current runtime display box: 75×75 logical pixels;
- current idle timing: 220 ms per frame;
- presentation-only animation, independent of authoritative simulation.

The `elevator-cargo-cat` reuses the same 128×128-frame, 2×2-sheet, 220 ms idle,
and bottom-center anchor contract, but its current runtime display box is a more
compact 50×50 logical pixels so it fits inside the elevator cabin.

A user-supplied reference may motivate a deliberate revision to this technical
frame, but the change must be recorded before generation and must not silently
break cross-tier scale or anchors.

## Input and production workflow

For each requested asset, the user supplies:

1. role name;
2. rarity tier (`N`, `R`, `SR`, `SSR`, or `UR`);
3. a design reference image.

Then the project will:

1. inspect the reference and record role/tier-specific visual locks;
2. create a candidate using the reference and this family brief;
3. preserve prompts, source images, edits, and provenance under the role/tier
   source folder;
4. normalize the grid, alpha, scale, pivot, padding, and frame anchors
   deterministically;
5. inspect a contact sheet, animation, and native-size game-context preview;
6. mark the manifest entry approved only after visual and technical review;
7. keep runtime integration separate until explicitly authorized.

## Acceptance gates

- Correct role and rarity identity at native game scale.
- Cohesive anatomy, rendering, camera, lighting, and scale across the catalog.
- Exact dimensions/frame count and usable alpha.
- No empty frames, clipping, edge contact, paste clamping, or unstable feet.
- No identity, costume, volume, or facing drift between animation frames.
- Reference provenance and generation/edit history recorded in the manifest.
- No runtime import, gameplay attribute, state, balance, or schema change as part
  of the current asset-only phase.
