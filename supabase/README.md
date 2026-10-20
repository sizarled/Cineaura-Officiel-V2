# Patreon code delivery — setup

The page `codeactivation.html` asks a buyer for his Patreon account, walks him
through Patreon's own OAuth sign-in, confirms the paid **membership (tier)** of
your campaign with Patreon's API, and hands him one unused activation code
(membership) or points serial. The same Patreon account coming back later gets
the same code again — the stock cannot be farmed by re-verifying.

## 0 · What Patreon's API can and cannot verify — read this first

Patreon's public API exposes **memberships/tiers** (the recurring
subscriptions), members, posts, campaigns and member webhooks. It does **not**
expose **shop storefront one-time product purchases** — that is the official,
current answer from Patreon ([their staff, 2025](https://www.patreondevelopers.com/t/inquiry-about-retrieving-shop-products-via-patreon-api/10109);
confirmed again in
[2026](https://www.patreondevelopers.com/t/how-to-get-sales-one-time-purchases-gifts-data-from-api/11371)).
So this page **cannot check a "Golden membership activation code · 6 months"
shop listing purchase**, and never will — that endpoint simply does not exist.

Sell codes in a way the API *can* verify:

- **Membership codes (Silver / Gold / Diamond, any duration) → sell as
  Patreon tiers.** A paid tier shows up in `identity?include=memberships` as
  `active_patron` with the entitled tier — exactly what `patreon-claim`
  verifies. One tier can even serve a fixed-duration code: the buyer pays the
  first charge, cancels whenever, and the claims journal below guarantees he
  only ever receives the code once (re-subscribing never hands a second).
- **Points serials and any truly one-time items → easiest honest path is the
  product content itself.** Generate unique serials in SQL
  (`point_codes_generate(20, 500, 'Patreon - 500 points')`) and paste each
  serial into its own shop listing (one listing = one code, Patreon even
  tracks limited quantity), or put the serials block in the product's
  post-purchase description. The buyer reads the code right after buying and
  redeems it on CineAura — no verification page needed for these.

If later Patreon opens an Orders API, this same edge function grows it behind
the door: the claims journal and the stock plumbing stay exactly as they are.

## 1 · Database

Run `sql/patreon.sql` in the Supabase SQL editor **once** (idempotent).
It creates the claims journal `patreon_claims`, the `reserved_by` /
`reserved_at` columns on both code stocks, and the atomic `patreon_claim()`
function. Only the edge function (service role) may run it.

## 2 · Edge function

```bash
supabase functions deploy patreon-claim
supabase secrets set \
  PATREON_CLIENT_ID=2sNmjkMRCpWrpSkHCx3x5RRPXdN2mQb4lhQTycevlklvLW_XMWZ7DnfQ0ZAvJXfI \
  PATREON_CLIENT_SECRET=<paste-your-client-secret> \
  PATREON_CAMPAIGN_ID=<your campaign id, from the Patreon developer portal>
```

Optional behavior knobs:

- `PATREON_DEFAULT_KIND=points` — what a patron gets when his entitled tier is
  not in the tier map (default: `membership`).
- `PATREON_TIER_MAP` — a JSON string mapping tier ids → what they buy, e.g.

```json
{
  "22123456": { "kind": "membership", "membership": "Gold", "duration": "1 month" },
  "22123457": { "kind": "membership", "membership": "Diamond", "duration": "3 months" },
  "22123458": { "kind": "points", "points": 500 }
}
```

The tier id of each tier lives in the Patreon developer portal (Tiers section)
or in the identity response under `included[]/type=tier`.

## 3 · Patreon client settings

In <https://www.patreon.com/portal/registration/register-clients> open your
client ("Ceneaura") and add this **exact** redirect URI — it must match the
page URL one-to-one:

```
https://<your-domain>/codeactivation.html
```

The page prints it to the DevTools console every load, so the registerings
host are always in scope.

The OAuth flow uses the scopes `identity identity.memberships identity[email]`
so Patreon can prove the buyer is an active, paid-up member of **your**
campaign — and nothing else.

## 4 · Filling the stock

- Membership codes are the rows of `activation` (see `sql/activation.sql`) —
  generate Silver/Gold/Diamond codes in the Panel / in SQL and the page starts
  selling them immediately.
- Points serials are the rows of `point_codes` (see `sql/point_codes.sql`) —
  `select * from public.point_codes_generate(10, 500, 'Patreon - 500 points');`
  produces ten 500-point serials, all instantly available to the page.

When the stock of the kind runs out the buyer sees “sold out — contact
support”, and `patreon_claims` tells you exactly who claimed which code.

## 5 · Security notes

- The OAuth **client secret** must never live in the site's files: the browser
  would hand it to everyone. It lives only in the edge function's environment.
  Because the secret was pasted in chat once, consider rotating it in the
  Patreon portal (Client settings → rotate), then `supabase secrets set` the
  new value — the page itself needs no change (it only ever uses the public
  client id).
- Reservation is a separate `reserved_by` flag, so a delivered code stays a
  perfectly normal code for the redemption systems (`account_code_redeem` and
  `points_code_redeem`) — the buyer redeems it on CineAura exactly like any
  other member.

# 6 · Memberships bought with POINTS (sql/membership_points.sql)

The reward points themselves buy the membership, straight in Dashboard →
Points ("Buy a membership with points"): three plan cards showing the money
price, the points price, and Buy/Extend. **The points price simply equals the
money price** — plan price in points = the plan's dollar price (Silver $5 /
3 mo · Gold $10 / 6 mo · Diamond $20 / 12 mo) × the withdrawal rate (points
per 1 unit of the currency, default 100 → 1 point = 1 cent), so a $5 Silver
is 500 points and a $20 Diamond is 2,000.

- The purchase spends through `_spend_prize` (the same locked check-and-deduct
  the prizes use; every buy is journaled in `point_spends` +
  `membership_purchases`) and activates through `_account_set_plan` (the
  activation codes' own helper) — a plan still running **stacks** the months
  onto its expiry.
- Custom prices: set `membership_points_prices` (JSON, e.g.
  `{"Silver":450,"Gold":900,"Diamond":1800}`) on the `panel_settings` row;
  any plan missing from it falls back to the ×rate equality.
- The shop section hides itself (and every RPC returns
  `{ok:false,reason:'setup'}`) when `prize_secure.sql`/`packages.sql` are not
  in yet, so the file is safe regardless of setup order.

Run `sql/membership_points.sql` in the SQL editor after those two files — the
site picks the new section up with no further change.
