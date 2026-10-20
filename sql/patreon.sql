-- Patreon → code delivery (codeactivation page)
-- Run in the Supabase SQL editor after activation.sql and point_codes.sql.
--
-- The page at codeactivation.html asks the visitor for his Patreon account and
-- sends him through Patreon's OAuth. The edge function (supabase/functions/
-- patreon-claim) confirms the membership of YOUR campaign with Patreon's API and
-- then calls the function below, which takes ONE unused code out of the stock —
-- activation (membership codes) or point_codes (points serials) — reserves it for
-- this Patreon identity and returns it. Every new visit of the same Patreon
-- account returns the SAME code again (nobody can farm the stock with OAuth
-- retries), and a code is reserved with the dedicated `reserved_by` column so the
-- redemption systems keep working with it exactly like any other code.

-- ---------------------------------------------------------------- 1. the claims journal
create table if not exists public.patreon_claims (
  id bigint generated always as identity primary key,
  patreon_user_id text not null unique,
  account text not null default '',           -- what the visitor typed into the box
  kind text not null check (kind in ('membership', 'points')),
  code text not null unique,
  payload jsonb not null default '{}'::jsonb, -- membership_type/duration or points
  created_at timestamptz not null default now()
);
comment on table public.patreon_claims is 'Which Patreon identity received which code — one claim per identity, forever idempotent';

alter table public.patreon_claims enable row level security;
-- the journal is private: only the edge function (service role) reads or writes it
drop policy if exists "PatreonClaims read" on public.patreon_claims;
drop policy if exists "PatreonClaims write" on public.patreon_claims;

-- ------------------------------------------------ 2. the reservation marker on the stocks
alter table public.activation add column if not exists reserved_by text;
alter table public.activation add column if not exists reserved_at timestamptz;
comment on column public.activation.reserved_by is 'PATREON:<user id> when the code was handed out on the Patreon activation page (redemption still works normally)';

alter table public.point_codes add column if not exists reserved_by text;
alter table public.point_codes add column if not exists reserved_at timestamptz;
comment on column public.point_codes.reserved_by is 'PATREON:<user id> when the serial was handed out on the Patreon activation page (redemption still works normally)';

-- ---------------------------------------------------------------- 3. the claim itself
create or replace function public.patreon_claim(
  p_user text,
  p_account text,
  p_kind text,
  p_membership text default null,
  p_duration text default null,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_act record;
  v_pc record;
  v_payload jsonb;
begin
  if p_kind not in ('membership', 'points') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;

  -- The same Patreon identity always sees the same code.
  select * into v_existing from public.patreon_claims where patreon_user_id = p_user for update;
  if found then
    return jsonb_build_object(
      'ok', true, 'reused', true,
      'kind', v_existing.kind,
      'code', v_existing.code,
      'detail', v_existing.payload
    );
  end if;

  if p_kind = 'membership' then
    -- One unused membership code nobody reserved, optionally pinned to a plan/duration.
    select id, activation_code, membership_type, duration
      into v_act
      from public.activation
     where used = false
       and coalesce(reserved_by, '') = ''
       and (member_id is null or member_id = '')
       and (p_membership is null or membership_type = p_membership)
       and (p_duration is null or lower(duration) = lower(p_duration))
     order by id
     limit 1
     for update skip locked;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'sold_out');
    end if;

    update public.activation
       set reserved_by = 'PATREON:' || p_user,
           reserved_at = now()
     where id = v_act.id;

    v_payload := jsonb_build_object('membership_type', v_act.membership_type, 'duration', v_act.duration);

    insert into public.patreon_claims (patreon_user_id, account, kind, code, payload)
    values (p_user, coalesce(p_account, ''), 'membership', v_act.activation_code, v_payload);

    return jsonb_build_object('ok', true, 'reused', false, 'kind', 'membership', 'code', v_act.activation_code, 'detail', v_payload);
  end if;

  -- points: one unused public serial nobody reserved and nobody pre-assigned.
  select code, points
    into v_pc
    from public.point_codes
   where used = false
     and uses < max_uses
     and coalesce(reserved_by, '') = ''
     and coalesce(member_id, '') = ''
     and coalesce(audience, 'public') = 'public'
     and (expires_at is null or expires_at > now())
     and (p_points is null or points = p_points)
   order by created_at
   limit 1
   for update skip locked;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'sold_out');
  end if;

  update public.point_codes
     set reserved_by = 'PATREON:' || p_user,
         reserved_at = now()
   where code = v_pc.code;

  v_payload := jsonb_build_object('points', v_pc.points);

  insert into public.patreon_claims (patreon_user_id, account, kind, code, payload)
  values (p_user, coalesce(p_account, ''), 'points', v_pc.code, v_payload);

  return jsonb_build_object('ok', true, 'reused', false, 'kind', 'points', 'code', v_pc.code, 'detail', v_payload);
end;
$$;

revoke execute on function public.patreon_claim(text, text, text, text, text, integer) from public;
grant execute on function public.patreon_claim(text, text, text, text, text, integer) to service_role;
