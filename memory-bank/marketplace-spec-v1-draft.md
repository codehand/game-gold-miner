# Marketplace v1 — Draft Specification

**Status:** Draft for product review; not indexed in `memory-bank/INDEX.md`.

**Purpose:** Define the first product and simulation contract for cats listed
on the marketplace. This document covers the story, attributes, role skills,
derived benefits, and the basic availability rules needed before implementing
authoritative buy, sell, and rental transactions.

This is a design draft, not a balance lock. The coefficients and caps below are
starting hypotheses and require deterministic tests plus playtesting before
they become production balance.

## 1. Scope and assumptions

The current interpretation of ownership is:

- One account may own many cat instances.
- Each cat instance has exactly one owner at a time.
- A cat instance is uniquely identifiable; two cats with the same name or role
  are still different instances.
- Shared ownership is not part of v1. If “many ownership” means co-ownership
  of one cat by multiple accounts, this draft must be revisited.

The v1 marketplace supports three product actions:

- **Buy:** acquire a permanent cat contract.
- **Sell:** transfer a permanent cat contract to another buyer.
- **Rent:** transfer temporary usage rights while ownership remains with the
  original owner.

The current UI preview already has `Buy`, `Rent`, and `My listings` tabs, a
1–24 hour rental selector, and sample listings. Those screens remain preview
surfaces until a server-backed listing and transaction model is implemented.

## 2. Story and product framing

The player is a mine operator. Cats are certified specialists whose contracts
can be assigned to mine operations. The marketplace is the exchange board of
the Cat Miners Guild, which verifies specialist profiles and coordinates
contract transfers between mine operators.

This framing gives each action a clear meaning:

| UI action | In-world meaning | Player result |
| --- | --- | --- |
| Buy | Sign a permanent specialist contract | The cat enters the buyer's idle roster |
| Sell | Transfer a permanent contract | The seller receives gold and loses the cat |
| Rent | Temporarily assign a specialist | The renter receives the role benefit for a fixed duration |

The UI can retain the simple words `Buy`, `Sell`, and `Rent`. Detail pages may
explain them as permanent, transfer, and hourly contracts so the player
understands why a rented cat returns automatically.

The market is useful because mine operators have different bottlenecks. One
operator may need an Elevator specialist, while another has a strong Elevator
cat sitting idle and can rent or sell that contract. The market therefore
creates value through role fit, not only through rarity.

## 3. Cat availability and ownership states

Every cat has one authoritative availability state. A cat cannot be used and
listed at the same time.

```text
Idle
├── Assigned       cat is active in the owner's mine
└── Listed         cat is held by an active sale or rental listing

Listed
├── Cancelled      returns to Idle for the owner
├── Sold           moves to the buyer's Idle roster
└── Rented         moves to the renter's active rental roster

Rented
└── Expired        returns to the owner's Idle roster
```

Required rules:

- `Assigned` cats cannot be listed for sale or rent.
- `Listed` cats cannot be assigned to a mine.
- A cat has at most one active listing.
- A cat cannot be listed for sale and rent simultaneously.
- A buyer receives a purchased cat in `Idle`; purchase does not auto-assign it
  to a mine.
- A rental changes usage rights, not ownership.
- A rented cat cannot be sold, re-rented, or assigned by the owner.
- Rental expiry is automatic and returns the cat to the owner's `Idle` roster.
- Listing, purchase, rental acceptance, cancellation, and expiry must be
  atomic server operations once live transactions exist.

Special roles may add limits later, such as `maxActivePerMine` or
`maxOwnedPerAccount`. Those limits belong to role configuration and do not
change the ordinary v1 lifecycle rules.

## 4. v1 attributes

The v1 attribute set is intentionally small. Each attribute must have a clear
meaning and must affect at least one real gameplay outcome.

| Attribute | Player-facing meaning | Typical use |
| --- | --- | --- |
| `Power` | Strength or magnitude of the cat's work | Mining output, heavy handling |
| `Speed` | How quickly the cat completes an operation | Cycle time, throughput |
| `Capacity` | How much the cat can handle per operation | Cart load, warehouse load |
| `Efficiency` | How effectively the cat converts work into useful output | Processing efficiency, reduced idle/waste |

All current values use an integer `0–100` range for display and comparison.
The game may store more precision internally, but the player-facing value must
round consistently.

`Fortune` is deliberately deferred. It should only be introduced when the
core game has a real critical reward, rare drop, or other probabilistic bonus
that players can understand and evaluate.

### Attribute design constraints

- A cat should have meaningful strengths and weaknesses; avoid four maximum
  attributes on ordinary listings.
- The total attribute budget should be controlled by the cat blueprint,
  rarity, and level rather than by independent unrestricted rolls.
- Attributes must be immutable during a live rental period. Leveling or
  stat-changing systems need a separate rule and transaction boundary.
- Every stat shown on a listing must be the exact current value used by the
  authoritative benefit calculation.
- A single overall rating may be shown as a summary, but it must never replace
  the detailed attribute table.

## 5. Rarity, level, and current stats

Rarity and level have separate responsibilities:

- **Rarity** controls the stat budget, stat ceiling, and future skill potential.
- **Level** controls the current stat values within those ceilings.
- **Role** controls how the current stats are interpreted.

Rarity should not directly multiply the final gameplay bonus by a large hidden
factor. Otherwise a lower-rarity cat with a good role fit becomes irrelevant,
and marketplace pricing becomes a rarity-only race.

A starting model is:

```text
currentStat = min(statCap, baseStat + levelGrowth × (level - 1))
```

The exact `statCap`, `baseStat`, and `levelGrowth` values are balance data. The
important contract is that the resulting values are deterministic, persisted
with the cat instance, and visible to both the listing viewer and the server.

## 6. Roles and weight profiles

Each role defines a weight profile. The profile converts the same four base
attributes into a role-specific score from `0–100`.

### Elevator

Elevator cats prioritize fast, high-volume movement:

| Attribute | Weight |
| --- | ---: |
| Power | 0.10 |
| Speed | 0.45 |
| Capacity | 0.30 |
| Efficiency | 0.15 |

### Warehouse

Warehouse cats prioritize processing and handling volume:

| Attribute | Weight |
| --- | ---: |
| Power | 0.10 |
| Speed | 0.25 |
| Capacity | 0.40 |
| Efficiency | 0.25 |

### Miner

Miner cats prioritize extraction strength and sustained output:

| Attribute | Weight |
| --- | ---: |
| Power | 0.45 |
| Speed | 0.30 |
| Capacity | 0.05 |
| Efficiency | 0.20 |

The current UI contains additional role filters such as `Unloader` and
`Hauler`. Those roles are not part of the v1 calculation contract unless they
are separately approved and assigned a profile.

## 7. Role Score calculation

For each cat, normalize the current attributes to `0–1`:

```text
normalizedStat = currentStat / 100
```

Then calculate the score for the cat's role:

```text
roleScore =
  Power      × powerWeight +
  Speed      × speedWeight +
  Capacity   × capacityWeight +
  Efficiency × efficiencyWeight
```

When the displayed `0–100` values are used directly, the equivalent result is
also in the `0–100` range. All role weights must sum to exactly `1.0`.

Example: an Elevator cat with the following stats:

```text
Power:      62
Speed:      90
Capacity:   72
Efficiency: 80
```

gets:

```text
Elevator roleScore =
  62×0.10 + 90×0.45 + 72×0.30 + 80×0.15
  = 77.3
```

The role score is useful for comparison, sorting, price guidance, and
analytics. It is not a replacement for the underlying attributes.

## 8. Skill and benefit calculation

V1 uses one primary skill per role. This keeps the market understandable and
prevents a cat from stacking too many simultaneous bonuses.

The starting formula is:

```text
skillBonus = baseBonus + maxVariableBonus × (roleScore / 100)
```

Suggested initial tuning bounds:

| Role | Primary skill | `baseBonus` | `maxVariableBonus` | Maximum |
| --- | --- | ---: | ---: | ---: |
| Elevator | `Lift Mastery` | 2% | 28% | 30% |
| Warehouse | `Storage Mastery` | 2% | 28% | 30% |
| Miner | `Mining Mastery` | 0% | 25% | 25% |

These values are deliberately conservative starting points. They must be
validated against the existing economy and may be reduced if a single cat
dominates upgrade progression.

The role applies the bonus to its primary rate:

```text
effectiveRate = baseRate × (1 + skillBonus)
```

For a time-based operation, use the mathematically stable equivalent:

```text
effectiveCycleTime = baseCycleTime / (1 + skillBonus)
```

This means a 30% rate bonus increases throughput by 30% without claiming that
the operation takes negative or implausibly small time.

### Role benefits

| Role | Primary benefit | Example player-facing text |
| --- | --- | --- |
| Elevator | Elevator throughput / cycle rate | `+23.3% elevator throughput` |
| Warehouse | Warehouse processing rate | `+21.8% warehouse processing` |
| Miner | Mining yield rate | `+18.5% mining output` |

The exact underlying base rate remains the responsibility of the relevant
simulation system. Marketplace skill calculation must only provide the
cat-derived modifier and must not duplicate mine, elevator, or warehouse base
logic.

## 9. Skill naming and specialization

The role has a stable primary skill name, while the strongest weighted
attribute may provide a specialization label.

Examples:

- Elevator + high Speed: `Rapid Lift`.
- Elevator + high Capacity: `Heavy Haul`.
- Warehouse + high Efficiency: `Smooth Operation`.
- Miner + high Power: `Power Mining`.

The specialization label is descriptive in v1. It must not introduce a second
hidden multiplier unless a separate balance rule is explicitly added. The
actual benefit remains the deterministic role-score formula above.

## 10. Market listing information

Every live listing should expose enough information for a rational decision:

- Cat instance/name.
- Role.
- Rarity.
- Level.
- Current `Power`, `Speed`, `Capacity`, and `Efficiency`.
- Role score.
- Primary skill and current bonus.
- Owner/seller display identity where product policy allows it.
- Sale price or hourly rental price.
- Rental duration selected by the buyer.
- Current availability and any role-limit warning.

The detail page should also show the player-facing outcome, for example:

```text
Lift Mastery
+23.3% elevator throughput

This cat is strongest when assigned to an Elevator operation.
```

Prices should not be presented as guaranteed value. The same cat can be worth
more to a player whose mine has an Elevator bottleneck than to a player whose
current bottleneck is Warehouse processing.

## 11. Marketplace behavior enabled by v1 stats

The attributes create three useful market decisions:

1. **Buy for long-term fit.** A player invests in a cat whose role score and
   skill match the mine's persistent bottleneck.
2. **Rent to test or bridge a bottleneck.** A player temporarily hires a cat
   before spending on a permanent contract or while waiting for an upgrade.
3. **Sell or rent surplus specialists.** An owner can monetize an idle cat,
   but must first remove it from active mine use.

This makes a role-fit SR cat potentially more attractive than a generic SSR
cat, which gives the marketplace more depth than a simple rarity shop.

## 12. Authority and consistency requirements

The client may preview role scores and benefits, but the server must be
authoritative for live transactions and any state change that affects gold,
ownership, rental rights, or assignment.

The server-side calculation must use the same versioned role configuration as
the client preview. A listing should retain or reference the calculation
version used to display its benefit so a future balance change does not make a
historical transaction ambiguous.

At minimum, a live transaction must revalidate:

- The cat exists and belongs to the expected owner.
- The cat is not assigned, rented, or already consumed by another transaction.
- The listing is active and has not expired or been cancelled.
- The buyer has enough gold.
- The role/account/mine limits permit the result.
- The transaction has not already been applied under the same idempotency key.

## 13. Deliberately deferred from v1

- `Fortune` and critical/rare reward mechanics.
- Multiple simultaneous active cats in one role slot.
- Secondary passive skills with separate multipliers.
- Shared ownership.
- Cat stat rerolls or stat training.
- Dynamic auction pricing.
- Real-money payments, tokens, or blockchain ownership.
- Special-role limits before those roles have an approved profile.

## 14. Draft acceptance criteria

The v1 design is ready for implementation planning when the following are
accepted:

- The four attributes and their player-facing meanings are approved.
- Elevator, Warehouse, and Miner weight profiles are approved or replaced.
- The role-score formula is deterministic and shared by preview and server.
- The primary skill and benefit for each role are defined.
- Rarity and level responsibilities are separated as described above.
- The cat state rules prevent simultaneous assignment and listing.
- The product accepts the proposed maximum bonus range as a balance starting
  point for playtesting.

