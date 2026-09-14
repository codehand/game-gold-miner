# Memory Bank restructure — measurements

2026-09-14. The Memory Bank was split into a lazy-loaded INDEX, live contract
files, and an archive of closed history, with a `PreToolUse` hook enforcing
section reads of the oversized contract files.

## Which budget this cuts

There is no `@import` of `memory-bank/` in `AGENTS.md` or `CLAUDE.md`
(`grep -n '@import\|@memory-bank\|@docs' AGENTS.md CLAUDE.md` → no match), so
**this does not lower the session startup floor and `/context` will not move.**

It cuts the *orientation* budget — the tokens the model burns reading
documentation after it receives a task. The old rule ("At the start of every
task, read every Markdown file in `memory-bank/`") cost **~269k tokens before any
work began**, which does not fit a 200k context at all and barely fits 1M once
autocompact headroom is subtracted. That is the number this change attacks.

## Before / after

| File | Before | After | What happened |
|---|---:|---:|---|
| `progress.md` | 260,605 | 5,125 | `## Completed` (140 KB) and the per-step narrative (63 KB) archived; status table compacted to Step/Status; risks triaged |
| `activeContext.md` | 237,185 | 4,915 | `## Recent Changes`, `## Next Steps`, `## Step 32A` archived; `## Current Focus` rewritten from narrative to live state; decisions triaged |
| `architecture.md` | 167,564 | 164,588 | **Contract — kept.** Only the duplicated incident sections removed. Read by section. |
| `techContext.md` | 125,690 | 121,617 | **Contract — kept.** Only the duplicated incident sections removed. Read by section. |
| `server-milestone-plan.md` | 101,253 | 32,232 | `## Status` narrative archived; its duplicate step table dropped in favour of the canonical one in `progress.md` |
| `server-threat-model.md` | 45,682 | 45,682 | **Contract — unchanged.** Findings F1–F13 already carry their resolutions inline. |
| `systemPatterns.md` | 38,241 | 32,951 | 4 duplicated incident sections removed |
| `server-save-sync-protocol.md` | 28,641 | 28,641 | **Contract — unchanged.** |
| `game-design-document.md` | 23,894 | 22,694 | Source of truth for scope; 1 duplicated incident section removed |
| `implementation-plan.md` | 23,821 | 23,821 | Source of truth for scope — unchanged |
| `productContext.md` | 14,254 | 13,055 | 1 duplicated incident section removed |
| `tech-stack.md` | 5,229 | 5,229 | unchanged |
| `projectbrief.md` | 3,612 | 3,612 | unchanged |
| `INDEX.md` | — | 5,313 | **new** — the only file read unconditionally |
| **Hot path total** | **1,075,671** | **509,475** | **−566,196 B (−52%), ~269k → ~127k tokens** |

Read unconditionally now: `INDEX.md` + `activeContext.md` + `progress.md` =
**15,353 B (~3.8k tokens)**, versus ~269k tokens under the old rule. Everything
else is opened deliberately, by section.

Archive (never read by default): **561,583 B**. Nothing was deleted.

## Where the history went

| Archive file | Bytes | Holds |
|---|---:|---|
| `archive/completed-log.md` | 291,785 | `progress.md` `## Completed`; `activeContext.md` `## Recent Changes`, `## Next Steps`, `## Step 32A`; 20 implementation records misfiled under `Active Decisions` |
| `archive/phase-narrative.md` | 144,480 | The prose `## Status Summary`, `## Current Focus`, and plan `## Status`, plus the duplicate step table |
| `archive/step-implementation-map.md` | 81,811 | Per-step packages, migrations, tests, review findings; full step table with evidence |
| `archive/acceptance-gates.md` | 21,456 | Base-game Steps 1–37 with evidence; deferred features; acceptance results |
| `archive/decision-log.md` | 11,058 | 63 settled base-game decisions with rationale |
| `archive/incident-log.md` | 9,315 | 4 closed defect reports |
| `archive/risks-resolved.md` | 1,678 | Risks closed by code, each with the reason it closed |

## Triage performed

**Duplication.** Four incident reports existed **verbatim in seven files at
once** (18 copies of 4 unique sections). Deduplicated to one canonical copy;
14 copies removed. `server-milestone-plan.md` also kept a second copy of the
server step table that had drifted from `progress.md`'s (it ordered Steps 15–17
before 13–14); the canonical copy is now the only one.

**`## Active Decisions`, 98 bullets →** 12 kept as still-binding, 2 corrected as
outdated, 63 moved to `decision-log.md`, 20 moved to `completed-log.md` (they
were implementation records, not decisions), 1 moved to `acceptance-gates.md`
(it was a gate).

Corrected as outdated:
- *"Keep MVP client-only and exclude monetization, blockchain, and social
  systems"* — superseded by the server milestone. Rewritten to state what is
  actually true: the game stays fully playable offline, cloud is a replica, no
  network call blocks boot, and monetization/social remain unbuilt.
- *"Bulk purchases remain deferred; mine scroll input arrives in Step 31"* —
  both shipped (x1/x5/MAX batch upgrades; Step 31 validated 2026-08-30).

**`## Known Risks`, 4 items →** 1 closed by code (`GameNumber` large-number
abstraction), 1 split (client-side offline bounding is closed; server-side
validation stays open for Phase 4), 2 kept. Four genuinely open risks that
existed only in prose were promoted into the list: iOS Safari 7-day storage
eviction, the fork chooser having no production surface, and the two
non-blocking base-game verification carry-overs.

Also corrected in `AGENTS.md`: the schema rule still claimed *"No relational or
server database exists"* — six Supabase tables have existed since Step 5.

## The hook

`.claude/hooks/memory-bank-guard.sh`, wired as a `PreToolUse` hook on
`Read|Bash` in `.claude/settings.json`.

**Threshold is in bytes, not lines, and was measured — not copied.** Line counts
mislead badly here: `activeContext.md` averaged ~129 B/line and
`server-milestone-plan.md` ~151 B/line, so a 350-line rule would have missed
files that are 100 KB+. The live size distribution has a natural gap at
32,951 B (`systemPatterns.md`) → 45,682 B (`server-threat-model.md`).
**40,000 B** sits in that gap and blocks exactly the three oversized contract
files. A 20,000 B threshold was rejected: it would block 8 of 14 files,
including both scope sources-of-truth (`game-design-document.md`,
`implementation-plan.md`), which the rules say to read for scope work.

| Case | Result | Why |
|---|---|---|
| `Read` a `memory-bank/*.md` over 40,000 B | **DENY** | the behaviour being prevented |
| `Read` with `offset`/`limit` | allow | the caller already bounded it |
| `Read` anything under `memory-bank/archive/` | allow | opening archive is always deliberate |
| `bash cat`/`less`/`more`/`bat` of such a file | **DENY** | the way around the first case |
| any command containing `\|` | allow | output is filtered downstream |
| `sed -n`, `grep`, `head`, `tail` | allow | already bounded |
| any file outside `memory-bank/` | untouched | the hook guards one scope |
| `Edit`/`Write` | untouched | matcher is `Read\|Bash` |

The deny message teaches rather than just refusing: it names the file and its
size, gives the `grep -n` and `sed -n` commands, points at `INDEX.md`, notes the
archive exemption, and gives the override. A refusal with no path forward just
makes the model retry the same way.

Missing `jq` exits 0 silently — a missing tool must never wedge a session.

## Testing

Verified before committing, with synthetic payloads (output = DENY, silence =
ALLOW):

```bash
H=.claude/hooks/memory-bank-guard.sh

# must DENY
echo '{"tool_name":"Read","tool_input":{"file_path":"memory-bank/architecture.md"}}' | sh $H
echo '{"tool_name":"Bash","tool_input":{"command":"cat memory-bank/techContext.md"}}'  | sh $H

# must ALLOW
echo '{"tool_name":"Read","tool_input":{"file_path":"memory-bank/INDEX.md"}}' | sh $H
echo '{"tool_name":"Read","tool_input":{"file_path":"memory-bank/architecture.md","offset":79,"limit":60}}' | sh $H
echo '{"tool_name":"Read","tool_input":{"file_path":"memory-bank/archive/decision-log.md"}}' | sh $H
echo '{"tool_name":"Bash","tool_input":{"command":"cat memory-bank/architecture.md | grep foo"}}' | sh $H

# settings schema — exit 0 = correct, 4 = wrong matcher, 5 = broken JSON
jq -e '.hooks.PreToolUse[] | select(.matcher == "Read|Bash") | .hooks[] | select(.type == "command") | .command' .claude/settings.json
```

All 16 matrix cases passed, plus the `MEMORY_BANK_MAX_BYTES=999999` override and
the missing-`jq` fallback.

**End-to-end test needs a restart.** Hooks load with the session config. Open
`/hooks` once (or restart) and confirm a `PreToolUse` entry with matcher
`Read|Bash` appears. Then ask for a whole read of `memory-bank/architecture.md`
(must be denied) and for `INDEX.md`, a sliced `architecture.md`, and
`archive/decision-log.md` (must pass).

If the hook still does not fire, temporarily prefix the command with a sentinel —
`echo "$(date) fired" >> /tmp/claude-hook-check.txt; sh "..."` — run any Bash
command, then `cat /tmp/claude-hook-check.txt`. **Remove the sentinel afterwards.**

## Findings reported, not fixed

**The two `## Complete Database Schema` copies are not byte-identical**, which
`AGENTS.md` requires. This predates this restructure — at `git HEAD` they were
already 26,392 B vs 28,329 B — and this change did not touch either copy's
content. 58 lines still differ:

- `techContext.md` carries Step 15 live-stack RLS evidence that `architecture.md`
  lacks.
- `architecture.md` carries the IndexedDB object-store table that
  `techContext.md` lacks.

Reconciling them is a content decision, not a mechanical one, and one of the two
is being edited by in-flight Step 19 work, so it was left alone. One unambiguous
staleness *was* fixed: `architecture.md` said "the version-1 save schema" where
the code is `CURRENT_SAVE_SCHEMA_VERSION = 2` and `techContext.md` already said
version-2.

**`CLAUDE.md` also states `CURRENT_SAVE_SCHEMA_VERSION = 1`**, which the code
contradicts. Left for the Step 19 documentation pass rather than edited here.

## MCP scope

Unchanged by this work. `.claude/settings.json` keeps its existing
`enabledPlugins`, and `.claude/settings.local.json` its `stitch` MCP server.
