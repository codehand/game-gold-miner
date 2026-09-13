-- Server-milestone Step 14 review finding (2026-09-12, corrected 2026-09-13):
-- rotating a recovery code was a revoke `update` followed by a separate
-- `insert` — two independent PostgREST requests, not one transaction. An
-- insert failure after a successful revoke left the account with no active
-- code at all. Wrapping both statements in a single `plpgsql` function makes
-- them one transaction: either both apply or neither does.
--
-- This does NOT mean Postgres serializes two concurrent `generate` calls for
-- the same user into a well-ordered queue — it doesn't. Both transactions'
-- revoke statements can still both clear the same row's `redeemed_at`/
-- `revoked_at is null` predicate before either commits, and both then race
-- their own `insert`. What actually makes that race safe is
-- `recovery_codes_one_active_per_user_idx`: whichever transaction's insert
-- commits first wins outright; the second transaction's insert raises
-- `23505` against that same index, and because this function's own revoke
-- and insert now share one transaction, that failure rolls back the loser's
-- revoke too — its "changes" are undone in full rather than left half-applied
-- (a committed revoke with no matching insert). The account is left with
-- exactly the winner's new code active; the loser's caller sees an error and
-- can retry. Atomicity is what supplies that guarantee, not lock-based
-- serialization on `user_id`.
--
-- A committed, live proof of exactly this rollback (a forced insert-half
-- collision leaving the pre-existing code untouched, plus a genuine
-- concurrent-`generate` race resolving to exactly one active code) lives in
-- `tests/server-integration/recovery-code.integration.test.ts`.
create function public.rotate_recovery_code(p_user_id uuid, p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recovery_codes
  set revoked_at = now()
  where user_id = p_user_id
    and redeemed_at is null
    and revoked_at is null;

  insert into public.recovery_codes (user_id, code_hash) values (p_user_id, p_code_hash);
end;
$$;
