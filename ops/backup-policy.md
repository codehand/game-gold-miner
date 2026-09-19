# Backup and restore policy

This is the Step 34 operating policy for the server milestone. Production
deployment and production credentials do not exist yet; the commands below are
the release checklist, not a claim that a hosted project is already protected.

## Policy

- Supabase managed backups are enabled for the production project once it is
  created, with one daily backup schedule.
- The target recovery point objective (RPO) is 24 hours.
- Keep at least seven daily copies. A longer retention period may be selected
  when the production data-protection review requires it.
- Recovery time is best effort. The local drill is the acceptance check for
  the application schema; a hosted restore also depends on Supabase support,
  project provisioning, and credential rotation.
- Run `npm run backup:restore` against a local stack before each schema release
  and at least monthly after launch. Preserve its JSON output with the release
  evidence, including table names, row counts, byte size, and timings.

## What the drill restores

The drill runs a real `pg_dump --format=custom --schema=public`, starts a fresh
`postgres:17-alpine` container, creates only a minimal `auth.users` foreign-key
reference, and restores the dump with `pg_restore`. It verifies that every
public application table and row count matches. The current schema contains
`profiles`, `saves`, `save_audit`, `recovery_codes`, `leaderboard_entries`,
`entitlements`, and `account_audit`.

The application backup does not restore Supabase Auth internals, sessions,
identities, Auth provider configuration, Edge Runtime caches, environment
secrets, or external provider accounts. The scratch `auth.users` table exists
only to satisfy the public foreign keys; it is not an Auth recovery.

## Recovery procedure

1. Freeze writes and record the incident time, affected project, and last known
   good backup.
2. Use the Supabase dashboard or support-assisted managed-backup restore to
   restore the production project to a new project or an explicitly approved
   point in time. Do not experiment against the only production copy.
3. Apply the repository's forward migrations and verify the complete public
   schema against `memory-bank/architecture.md` and `memory-bank/techContext.md`.
4. Restore or re-establish Auth separately: users and identities, OAuth
   provider settings, redirect URLs, service secrets, Edge Function secrets,
   and any rotated JWT/signing configuration. Revoke sessions if their
   integrity is uncertain.
5. Run the server health check, core portability check, RLS/adversarial suite,
   and a save upload/download smoke test against the recovered project.
6. Rotate credentials that may have been exposed, switch traffic only after
   the smoke tests pass, and record the actual RTO, data loss, and excluded
   state in the incident log.

The public schema is the recoverable application state. Auth state and secrets
are separate recovery domains and must never be inferred from a successful
application-schema restore.
