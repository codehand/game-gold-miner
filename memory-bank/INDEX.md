# Memory Bank — INDEX

**Read this file first. Then open only the files and sections your task needs.
Do not read the whole Memory Bank.** The live documents total ~126k tokens;
reading them all wastes most of a context window on history you do not need.

## Opening one section

Section names are stable; line numbers are not. Get the map, then slice:

```bash
grep -n '^## ' memory-bank/<file>.md            # section map
grep -n '^## \|^### ' memory-bank/architecture.md   # the two largest files
sed -n '<start>,<end>p' memory-bank/<file>.md   # or Read with offset/limit
```

A `PreToolUse` hook blocks whole-file reads of Memory Bank files over
20,000 bytes. `archive/` is exempt. To override for one command:
`MEMORY_BANK_MAX_BYTES=999999 <command>`.

## Live contract

| File | ~tokens | Read when |
|---|---|---|
| `INDEX.md` | 1k | Always. This file. |
| `activeContext.md` | 1k | Always — current step, current gate, binding decisions. |
| `progress.md` | 1k | Always — phase status, step status, open risks. |
| `projectbrief.md` | 1k | You need the one-paragraph "what is this". |
| `tech-stack.md` | 1k | Choosing or changing a dependency. |
| `productContext.md` | 3k | Player-facing intent, why a feature exists. |
| `game-design-document.md` | 6k | Gameplay loop, systems, UI, economy, MVP scope. **Source of truth for scope.** |
| `implementation-plan.md` | 6k | The 37 base-game steps and their gates. **Source of truth for scope.** |
| `server-save-sync-protocol.md` | 7k | Touching save upload/download, revisions, conflicts, `409`. |
| `server-milestone-plan.md` | 8k | Server milestone scope, phases, rejected approaches. |
| `systemPatterns.md` | 8k | Adding a pattern, or checking an existing one before inventing another. |
| `server-threat-model.md` | 11k | Any auth, identity, session, or anti-cheat change. Findings F1–F13 carry their resolutions inline. |
| `techContext.md` | 30k | **By section only.** Toolchain, commands, DB schema, constraints. |
| `architecture.md` | 40k | **By section only.** The layer contracts and the DB schema. |

## `architecture.md` — section map

Most sections are 4–40 lines; open the one you need.

**Layering and state:** Current Status · Implemented Foundation · Current File
Responsibilities · Runtime Module Boundaries · Dependency Boundaries · Planned
Data Flow · Authoritative State Model

**Simulation contracts:** Simulation Timing · Extraction · Elevator Transport ·
Warehouse Conversion · Production Rate · Upgrade Purchase · Milestone · Floor
Unlock · Economy Progression Simulation

**Persistence contracts:** Save Document Schema — Version 2 · Save Recovery ·
Offline Income · Lifecycle Persistence · Save Diagnostic Surface

**Presentation contracts:** Portrait Layout · Mine Scroll and Input · Mine View ·
Cat Role Asset Catalog · Live Production Stage · HUD · Purchase Control · Floor
Unlock · Provisional Balance Snapshot · Production Build · Complete Player
Journey E2E

**`## Server Stack Contract`** (the largest section) — subsections:
Google sign-in (Step 10) · Telegram sign-in (Step 12) · Save storage, upload,
and download (Steps 15–17) · Client remote repository (Step 19) · Adopting an
existing local save (Step 20) · Surviving local storage eviction (Step 21) ·
The server clock is the only clock (Step 22) · Upper-bound re-simulation
(Step 23) · Rejection handling (Step 24) · Guest linking and the identity
collision (Step 13) · Recovery code
(Step 14)

**`## Complete Database Schema`** — subsections: How a `GameNumber` is stored ·
Storage of the save document (`text`, not `jsonb`) · Tables · Column reference ·
Indexes, and the ones deliberately absent · Row-level security · Relationships
and deletion · Recovery-code hashing · What Step 3 does not design

`techContext.md` carries the same `## Complete Database Schema` subsections
byte-identically, plus `## Implemented Toolchain`, `## Verified Commands`,
`## Complete Save Document Schema`, `## Conventions`, and
`## Constraints and Security`. Both schema copies must change together.

## Archive — do not read by default

`memory-bank/archive/` holds closed history: finished steps, passed gates,
settled decisions, resolved risks. It is **not** part of the contract. Open one
file only when you need the provenance of a specific step or decision.

| File | Holds |
|---|---|
| `completed-log.md` | Finished work: base-game Steps 1–37 and server Steps 1–24. |
| `acceptance-gates.md` | Passed gates with evidence; features deferred at the Step 37 close. |
| `decision-log.md` | Settled base-game decisions and their rationale. |
| `risks-resolved.md` | Risks closed by code, each with the reason it closed. |
| `step-implementation-map.md` | Which server step produced which package, migration, and test. |
| `phase-narrative.md` | The prose account of how each phase unfolded. |
| `incident-log.md` | Four closed base-game defect reports. |

## Maintenance

- A file gains or loses a `##` section → update its row here **in the same change**.
- Work closes → append it to `archive/completed-log.md`; live files keep status only.
- A gate passes → append it to `archive/acceptance-gates.md`.
- A decision settles → move it from `activeContext.md` to `archive/decision-log.md`.
- A risk is closed by code → move it to `archive/risks-resolved.md` **with the
  reason**, never delete it.
- Do not let `architecture.md` or `techContext.md` grow further; they are read by
  section, not whole.
