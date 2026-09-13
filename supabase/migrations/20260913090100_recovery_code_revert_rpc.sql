-- Server-milestone Step 14 review finding (2026-09-13):
-- `revertRecoveryCodeRedemptionViaServiceRole` cleared `redeemed_at` with a
-- plain `update ... where code_hash = ? and revoked_at is null`. In the
-- narrow window between a failed session mint and this revert running, the
-- same caller could hit `POST /v1/generate` on another authenticated
-- session and rotate a fresh active code — at which point the plain update
-- above would try to revive the just-spent code as *also* active, which
-- `recovery_codes_one_active_per_user_idx` correctly refuses (a `23505`,
-- caught and logged by `handleRedeem`'s own try/catch, never surfaced to the
-- caller). The account is not corrupted — the fresh code from that
-- concurrent `generate` remains the sole way back in — but the revert
-- degrades to pre-fix behavior for the specific code being reverted, and it
-- does so by throwing an avoidable constraint violation rather than by
-- deciding not to revert in the first place.
--
-- `revert_recovery_code_redemption` makes that decision explicitly: it only
-- clears `redeemed_at` when the account holds no other active code at all.
-- When a fresher code already exists, the update matches zero rows — a
-- silent no-op, not an error — leaving the fresher code as the sole active
-- one and the reverted code's own row exactly as it was.
create function public.revert_recovery_code_redemption(p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.recovery_codes where code_hash = p_code_hash;

  if v_user_id is null then
    return;
  end if;

  update public.recovery_codes
  set redeemed_at = null
  where code_hash = p_code_hash
    and revoked_at is null
    and not exists (
      select 1
      from public.recovery_codes existing
      where existing.user_id = v_user_id
        and existing.redeemed_at is null
        and existing.revoked_at is null
    );
end;
$$;
