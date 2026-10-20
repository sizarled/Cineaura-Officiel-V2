-- Buy a membership with POINTS (no Patreon, no money code) — the user's price
-- rule is simply equality with the money price: a plan costs as many points as
-- its dollar price × the withdrawal rate (points per 1 unit of the currency —
-- 100 by default: 1 point = 1 cent). Silver ($5 / 3 months) = 500 points,
-- Gold ($10 / 6 months) = 1000, Diamond ($20 / 12 months) = 2000 — unless the
-- owner pins custom prices in panel_settings.membership_points_prices
-- (JSON, e.g. {"Silver": 450, "Gold": 900, "Diamond": 1800}).
--
-- Buy flow (Dashboard → Points → "Buy a membership with points"): the member
-- taps a plan → membership_buy_with_points() spends check-and-deduct inside the
-- SAME locked transaction the prizes use (_spend_prize), then hands the
-- months to _account_set_plan — the exact helper the activation codes use, so
-- a plan still running gets the months stacked onto its expiry. One tap, the
-- membership starts immediately; nothing to copy or type.
--
-- Run in the Supabase SQL editor AFTER prize_secure.sql and packages.sql.
-- Safe to run more than once.

-- ── 1 · optional owner-set prices (null/absent → money price × rate) ─────────
alter table public.panel_settings add column if not exists membership_points_prices jsonb;
comment on column public.panel_settings.membership_points_prices is
  'Optional plan point prices, e.g. {"Silver":450,"Gold":900,"Diamond":1800}. Absent or a missing key falls back to the money price (Silver $5 · Gold $10 · Diamond $20) times the withdrawal rate.';

-- ── 2 · the purchase journal ─────────────────────────────────────────────────
create table if not exists public.membership_purchases (
  id bigint generated always as identity primary key,
  member_id text not null,
  plan text not null check (plan in ('Silver', 'Gold', 'Diamond')),
  months int not null,
  points int not null,
  price_usd_cents int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.membership_purchases is 'Memberships bought with points (membership_buy_with_points)';
create index if not exists membership_purchases_member_idx on public.membership_purchases (member_id, created_at desc);

alter table public.membership_purchases enable row level security;
drop policy if exists "MembershipPurchases select" on public.membership_purchases;
create policy "MembershipPurchases select" on public.membership_purchases for select to anon, authenticated using (true);
revoke insert, update, delete on public.membership_purchases from anon, authenticated;

-- ── 3 · the price of a plan in points ────────────────────────────────────────
create or replace function public.membership_point_price(p_plan text) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_override int;
  v_cents int;
  v_rate int := 100; -- points per 1 unit of the currency (withdraw_settings)
begin
  -- money floor, mirroring the prices on the activation page
  v_cents := case p_plan when 'Silver' then 500 when 'Gold' then 1000 when 'Diamond' then 2000 else -1 end;
  if v_cents < 0 then return null; end if;

  -- owner override in Panel settings (guard: the column may not exist yet)
  begin
    select (membership_points_prices ->> p_plan)::int into v_override
      from public.panel_settings where id = 1 limit 1;
  exception
    when undefined_column or invalid_text_representation or numeric_value_out_of_range then
      v_override := null;
  end;
  if v_override is not null and v_override >= 0 then return v_override; end if;

  if to_regclass('public.withdraw_settings') is not null then
    select rate into v_rate from public.withdraw_settings where id = 1 limit 1;
  end if;
  v_rate := greatest(1, coalesce(v_rate, 100));

  -- the equality rule: $5 at 100 points/$1 → 500 points
  return ceil(v_cents::numeric / 100.0 * v_rate)::int;
end $$;

-- ── 4 · the shop window: plans, prices, the member's balance ─────────────────
create or replace function public.membership_points_catalog(p_member text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pts jsonb;
  v_available bigint := 0;
  v_mem record;
begin
  if to_regprocedure('public._points(text)') is null then
    return jsonb_build_object('ok', false, 'reason', 'setup');
  end if;
  v_pts := public._points(p_member);
  v_available := greatest(0, coalesce((v_pts->>'available')::bigint, 0));

  select membership_type, membership_expires_at, status
    into v_mem from public.members where member_id = p_member limit 1;

  return jsonb_build_object(
    'ok', true,
    'available', v_available,
    'membership', jsonb_build_object(
      'type', coalesce(v_mem.membership_type, 'Free'),
      'active', v_mem.membership_expires_at is not null and v_mem.membership_expires_at > now() and lower(btrim(coalesce(v_mem.status, ''))) = 'active',
      'expires_at', v_mem.membership_expires_at
    ),
    'plans', jsonb_build_array(
      jsonb_build_object('plan', 'Silver',  'months', 3,  'price_usd_cents', 500,  'price_points', public.membership_point_price('Silver')),
      jsonb_build_object('plan', 'Gold',    'months', 6,  'price_usd_cents', 1000, 'price_points', public.membership_point_price('Gold')),
      jsonb_build_object('plan', 'Diamond', 'months', 12, 'price_usd_cents', 2000, 'price_points', public.membership_point_price('Diamond'))
    )
  );
end $$;

-- ── 5 · the purchase, atomically: spend → months ─────────────────────────────
create or replace function public.membership_buy_with_points(p_member text, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_months int;
  v_price int;
  v_pts jsonb;
  v_avail bigint;
  v_plan jsonb;
begin
  if to_regprocedure('public._points(text)') is null
     or to_regprocedure('public._spend_prize(text,int,text,text)') is null
     or to_regprocedure('public._account_set_plan(text,text,int)') is null then
    return jsonb_build_object('ok', false, 'reason', 'setup');
  end if;

  v_months := case p_plan when 'Silver' then 3 when 'Gold' then 6 when 'Diamond' then 12 else -1 end;
  if v_months < 0 then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  v_price := public.membership_point_price(p_plan);
  if v_price is null or v_price < 0 then return jsonb_build_object('ok', false, 'reason', 'price'); end if;

  v_pts := public._points(p_member);
  v_avail := greatest(0, coalesce((v_pts->>'available')::bigint, 0));
  if v_avail < v_price then
    return jsonb_build_object('ok', false, 'reason', 'no_points', 'price', v_price, 'available', v_avail);
  end if;

  -- the same locked spend the prizes use (writes point_spends, bumps points_spent)
  if not public._spend_prize(p_member, v_price, 'Membership: ' || p_plan || ' · ' || v_months || ' months', 'membership') then
    return jsonb_build_object('ok', false, 'reason', 'no_points', 'price', v_price, 'available', v_avail);
  end if;

  -- the same helper the activation codes run through (same plan still running stacks)
  v_plan := public._account_set_plan(p_member, p_plan, v_months);

  insert into public.membership_purchases (member_id, plan, months, points, price_usd_cents, expires_at)
  values (p_member, p_plan, v_months, v_price,
          case p_plan when 'Silver' then 500 when 'Gold' then 1000 else 2000 end,
          (v_plan->>'expires_at')::timestamptz);

  return jsonb_build_object(
    'ok', true,
    'plan', p_plan,
    'months', v_months,
    'points', v_price,
    'expires_at', v_plan->>'expires_at',
    'extended', coalesce((v_plan->>'extended')::boolean, false),
    'available', greatest(0, v_avail - v_price)
  );
end $$;

grant execute on function public.membership_point_price(text) to anon, authenticated;
grant execute on function public.membership_points_catalog(text) to anon, authenticated;
grant execute on function public.membership_buy_with_points(text, text) to anon, authenticated;
