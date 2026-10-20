# Patreon code delivery — setup

The page `codeactivation.html` asks a buyer for his Patreon account, walks him
through Patreon's own OAuth sign-in, confirms the paid membership of your
campaign with Patreon's API, and hands him one unused activation code
(membership) or points serial. The same Patreon account coming back later gets
the same code again — the stock cannot be farmed by re-verifying.

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
