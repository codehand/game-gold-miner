#!/bin/sh
# PreToolUse guard: force section reads of oversized Memory Bank documents.
#
# Denies a whole-file Read (or `cat`/`less`/`more`/`bat`) of a memory-bank/*.md
# file larger than MEMORY_BANK_MAX_BYTES. Allows sliced reads, archive/ reads,
# piped commands, and anything outside memory-bank/.
#
# Threshold chosen from this repo's own size distribution: the natural gap runs
# 32,951 B (systemPatterns.md) -> 45,682 B (server-threat-model.md), so 40,000
# blocks exactly the three oversized contract files and lets every other live
# document through whole.

MAX="${MEMORY_BANK_MAX_BYTES:-40000}"

# Missing jq must never wedge a session.
command -v jq >/dev/null 2>&1 || exit 0

payload=$(cat)
[ -n "$payload" ] || exit 0

tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
[ -n "$tool" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-.}"

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# Resolve a path as given, then relative to the project root.
size_of() {
  _p="$1"
  [ -f "$_p" ] && wc -c < "$_p" | tr -d ' ' && return 0
  [ -f "$root/$_p" ] && wc -c < "$root/$_p" | tr -d ' ' && return 0
  return 1
}

# memory-bank/*.md, excluding archive/
is_guarded() {
  case "$1" in
    *memory-bank/archive/*) return 1 ;;
    *memory-bank/*.md)      return 0 ;;
    *)                      return 1 ;;
  esac
}

reason_for() {
  printf '%s' "Blocked: $1 is $2 bytes; whole-file Memory Bank reads over $MAX bytes are not allowed.

Read it by section instead:
  grep -n '^## \\|^### ' $1     # section map
  sed -n 'START,ENDp' $1        # or Read with offset/limit

Start from memory-bank/INDEX.md — it maps every document to its sections and
says which ones your task actually needs.

memory-bank/archive/ is exempt (closed history, opened deliberately).
To override for one command: MEMORY_BANK_MAX_BYTES=999999 <command>"
}

case "$tool" in
  Read)
    file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
    [ -n "$file" ] || exit 0
    is_guarded "$file" || exit 0
    # An explicit slice means the caller already bounded the read.
    sliced=$(printf '%s' "$payload" | jq -r 'if (.tool_input.offset // empty) or (.tool_input.limit // empty) then "y" else "n" end')
    [ "$sliced" = "y" ] && exit 0
    bytes=$(size_of "$file") || exit 0
    [ "$bytes" -gt "$MAX" ] && deny "$(reason_for "$file" "$bytes")"
    exit 0
    ;;
  Bash)
    cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
    [ -n "$cmd" ] || exit 0
    # A pipe means the output is filtered downstream.
    case "$cmd" in *\|*) exit 0 ;; esac
    # Only whole-file dumpers; sed -n / grep / head / tail are already bounded.
    case "$cmd" in
      cat\ *|less\ *|more\ *|bat\ *|*\ cat\ *|*\ less\ *|*\ more\ *|*\ bat\ *) ;;
      *) exit 0 ;;
    esac
    for word in $cmd; do
      is_guarded "$word" || continue
      bytes=$(size_of "$word") || continue
      [ "$bytes" -gt "$MAX" ] && deny "$(reason_for "$word" "$bytes")"
    done
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
