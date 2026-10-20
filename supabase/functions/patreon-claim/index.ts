// Patreon OAuth → membership verification → one code from the site stock.
// Deploy:  supabase functions deploy patreon-claim
// Secrets: supabase secrets set PATREON_CLIENT_ID=… PATREON_CLIENT_SECRET=… PATREON_CAMPAIGN_ID=…
// Optional PATREON_TIER_MAP='{"TIERID":{"kind":"membership","membership":"Gold","duration":"1 month"},"TIERID2":{"kind":"points","points":500}}'
// Optional PATREON_DEFAULT_KIND=membership   (what a patron gets when no tier mapping hits)
//
// The browser never sees the OAuth client secret: the exchange with Patreon's
// API happens here, and Supabase itself injects SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY so the claim RPC keeps the stock atomic.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);

  let body: { code?: string; redirect_uri?: string; account?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_json" }, 400);
  }
  const oauthCode = String(body.code || "").trim();
  const redirectUri = String(body.redirect_uri || "").trim();
  const account = String(body.account || "").trim().slice(0, 120);
  if (!oauthCode || !redirectUri) return json({ ok: false, reason: "missing" }, 400);

  const CLIENT_ID = Deno.env.get("PATREON_CLIENT_ID") || "";
  const CLIENT_SECRET = Deno.env.get("PATREON_CLIENT_SECRET") || "";
  const CAMPAIGN = Deno.env.get("PATREON_CAMPAIGN_ID") || "";
  if (!CLIENT_ID || !CLIENT_SECRET || !CAMPAIGN) {
    return json({ ok: false, reason: "not_configured" }, 500);
  }

  // 1 · OAuth code → access token -------------------------------------------------
  let token = "";
  try {
    const resp = await fetch("https://www.patreon.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: oauthCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    if (!resp.ok) return json({ ok: false, reason: "oauth", msg: await resp.text() }, 401);
    token = (await resp.json())?.access_token || "";
  } catch (e) {
    return json({ ok: false, reason: "oauth", msg: String(e) }, 502);
  }
  if (!token) return json({ ok: false, reason: "oauth" }, 401);

  // 2 · who are you, and are you OUR paying patron? -------------------------------
  let ident: any = null;
  try {
    const q = new URLSearchParams({
      include: "memberships.campaign,memberships.currently_entitled_tiers",
      "fields[user]": "email,full_name",
      "fields[member]": "patron_status,currently_entitled_amount_cents,last_charge_status",
      "fields[tier]": "title,amount_cents",
    });
    const resp = await fetch(`https://www.patreon.com/api/oauth2/v2/identity?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return json({ ok: false, reason: "identity", msg: await resp.text() }, 502);
    ident = await resp.json();
  } catch (e) {
    return json({ ok: false, reason: "identity", msg: String(e) }, 502);
  }

  const userId = String(ident?.data?.id || "");
  if (!userId) return json({ ok: false, reason: "identity" }, 502);
  const name = ident?.data?.attributes?.full_name || "";
  const email = ident?.data?.attributes?.email || "";

  const included: any[] = Array.isArray(ident?.included) ? ident.included : [];
  const membership = included.find(
    (x) =>
      x?.type === "member" &&
      x?.relationships?.campaign?.data?.id === CAMPAIGN,
  );
  if (!membership) return json({ ok: false, reason: "not_patron", name });

  const status = String(membership?.attributes?.patron_status || "");
  const lastCharge = String(membership?.attributes?.last_charge_status || "");
  if (status !== "active_patron" && lastCharge !== "Paid") {
    return json({ ok: false, reason: "not_active", name, status });
  }

  // 3 · which tier, then which kind of code ---------------------------------------
  const tierIds: string[] = (membership?.relationships?.currently_entitled_tiers?.data || [])
    .map((t: any) => String(t?.id || ""))
    .filter(Boolean);

  let tierMap: Record<string, any> = {};
  try {
    tierMap = JSON.parse(Deno.env.get("PATREON_TIER_MAP") || "{}");
  } catch {
    tierMap = {};
  }
  let mapped: any = null;
  for (const tid of tierIds) {
    if (tierMap[tid]) {
      mapped = tierMap[tid];
      break;
    }
  }
  const kind = mapped?.kind || Deno.env.get("PATREON_DEFAULT_KIND") || "membership";
  const membershipType = mapped?.membership || null;
  const duration = mapped?.duration || null;
  const points = Number(mapped?.points) > 0 ? Number(mapped.points) : null;

  // 4 · one code out of the stock, atomically --------------------------------------
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/patreon_claim`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        p_user: userId,
        p_account: account || name || email,
        p_kind: kind,
        p_membership: membershipType,
        p_duration: duration,
        p_points: points,
      }),
    });
    if (!resp.ok && (await resp.text()).includes("patreon_claim")) {
      return json({ ok: false, reason: "sql_missing" }, 500);
    }
    const claim = await resp.json().catch(() => null);
    if (claim?.ok) {
      return json({ ...claim, name, email, tierIds });
    }
    return json({ ok: false, reason: claim?.reason || "claim", name }, 200);
  } catch (e) {
    return json({ ok: false, reason: "claim", msg: String(e) }, 502);
  }
});
