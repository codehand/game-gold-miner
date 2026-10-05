# Boru — Excavator Miner concept

Status: concept approved by user on 2026-09-30. The sibling action folders
now contain the implemented animation family; see ../provenance.md.

## Character and visual direction

- Working name: Boru. Proposed rarity: SSR. Existing role: Miner, no new role.
- Calico operator with cream muzzle, charcoal and ginger patches, amber eyes,
  navy work overalls and brass-yellow safety helmet/headlamp. Both paws hold
  the excavator controls; the face stays visible above the machine.
- Compact tracked mini excavator: ochre/brass boom, navy steel body, dark
  rubber tracks, restrained turquoise power accent. No logo or text.
- Side view facing right with shallow top surfaces, matching Mica/Tobi and
  the mine's dark outlines, warm highlights and readable pixel-inspired shapes.
- Silhouette priorities: cat ears/face, two-segment articulated boom, scoop
  bucket, short tracks. Avoid large enclosed cab, tall antenna, smoke or wide FX.

## Gameplay-facing motion contract

1. Leave the white receiving cat with a raised, empty bucket; face right.
2. Stop at the gold pile. Lower the boom, tilt bucket into ore, curl it closed.
3. Lift the loaded bucket clear of the pile; keep the load visible.
4. Face left and drive back with the bucket raised and full.
5. Stop beside the white receiving cat, tip the bucket and deposit the gold.
6. Reset to empty before starting the next trip.

Use the existing core extraction/delivery milestones. Animation must not mint
extra currency or credit production twice. Do not show a swinging pickaxe on
this identity. Preserve the current one-owned-instance-per-floor assignment
rule and the five-worker cap; do not introduce per-visible-machine ownership.

## Technical target for the later animation pass

- Phaser 4.2.1, 360x640 portrait layout. Proposed wide sprite envelope near
  68x52 logical pixels, to be tuned against the actual floor without obscuring
  the white cat, ore pile, or upgrade control. Do not widen the floor itself.
- Concept: one isolated master, solid-magenta raw -> transparent processed PNG.
- Production: separate travel-empty, scoop/lift, travel-loaded, and deposit
  action sheets; premium eight authored poses per action, 4x2 delivery grid,
  transparent 128px cells if native-scale checks pass. Reuse one scale profile
  and track baseline across actions. Never shrink just the digging frames.
- Nearest filtering. Fixed chassis root and track contact line, not per-frame
  bbox centering; the bucket's extension must not shift the entire vehicle.
- Mirroring must reverse cat, chassis and bucket together. Cargo remains
  visible on the return leg and clears only at the deposit event.
- With multiple crew copies, phase stagger/spacing must avoid bucket overlap;
  verify a five-worker floor before claiming production readiness.

## Proposed Marketplace presentation

- Name: Boru. Role badge: Miner. Rarity badge: SSR.
- Description: "A compact excavator specialist who scoops ore and carries it
  back to the receiving crew."
- Portrait: cat plus recognizable boom/track silhouette, no baked UI labels.
- Buy with gold; one purchase creates one owned instance usable on one floor.
- Implemented initial balance: 42,000 gold; Power 96, Speed 68, Capacity 95,
  Efficiency 90. Existing Miner production formula, no additional gold reward.

## Review and delivery boundary

The static master remains a concept reference, not a runtime sprite. The user
approved implementation; separate processed/aligned sheets supply runtime art.
The initial balance remains subject to playtesting, not a new economy formula.
