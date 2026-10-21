// Panel — Social platforms: publishing queue ("Platforms" section) and the API
// settings block rendered inside Panel > Settings (slot #pf-settings-slot).
// The tables and RPCs live in sql/platforms.sql; the scheduled sender is the
// edge function supabase/functions/platform-publish. Only staff (section
// "platforms" for the queue, "settings" for the credentials) can read or write.
(function () {
  const C = () => window.CineAura;
  const P = () => window.CineAuraPlatforms;
  const t = (k, v) => (C()?.t ? C().t(k, v) : k);
  const esc = (s) => (C()?.escapeHtml ? C().escapeHtml(s) : String(s ?? ""));
  const toast = (m) => C()?.toast?.(m);

  /* Credential fields each network asks for; every network also accepts
     webhook_url — the edge function POSTs the payload there (Zapier / Make /
     n8n / any receiver) when native credentials are missing. */
  const CRED_FIELDS = {
    youtube: ["client_id", "client_secret", "refresh_token", "channel_id"],
    facebook: ["page_id", "page_access_token", "group_id"],
    instagram: ["ig_user_id", "access_token"],
    tiktok: ["client_key", "client_secret", "access_token", "open_id"],
    telegram: ["bot_token", "chat_id"],
    reddit: ["client_id", "client_secret", "refresh_token", "subreddit"],
    pinterest: ["access_token", "board_id"],
    tumblr: ["api_key", "access_token", "blog_identifier"],
    vimeo: ["access_token"],
    x: ["api_key", "api_secret", "access_token", "access_secret"],
    threads: ["access_token", "user_id"],
    quora: [], rumble: [], odysee: [], bilibili: [], snapchat: [],
  };

  const DAY_NAMES = () => [0, 1, 2, 3, 4, 5, 6].map((d) => t("panel.pf.d." + d));
  const dayLabel = (d) => (d === null || d === undefined || d === "" || Number.isNaN(Number(d)) ? t("panel.pf.every") : t("panel.pf.d." + Number(d)));

  let config = null; // platform_settings rows by platform
  let configToken = "";

  async function loadConfig(token, force = false) {
    if (config && configToken === token && !force) return config;
    config = {};
    configToken = token;
    const res = await C().rpc("platforms_config", { p_token: token });
    if (res?.ok && Array.isArray(res.data)) res.data.forEach((r) => (config[r.platform] = r));
    return config;
  }

  /* ────────────────────────── Panel > Settings: the Social platforms API block ── */

  function credsSummary(creds, key) {
    const fields = (CRED_FIELDS[key] || []).filter((f) => String(creds?.[f] || "").trim());
    const wh = String(creds?.webhook_url || "").trim();
    const n = fields.length + (wh ? 1 : 0);
    return n ? t("panel.pf.credsSet", { n }) : t("panel.pf.credsNone");
  }

  async function renderSettings(slot, ctx) {
    if (!slot) return;
    const token = ctx?.token ? ctx.token() : "";
    if (!token) return;
    slot.innerHTML = `
      <div class="pf-box">
        <p><b>${t("panel.pf.settingsTitle")}</b><br /><span class="muted">${t("panel.pf.settingsHint")}</span></p>
        <div class="pf-set-grid" data-pf-set>
          <p class="muted" style="grid-column:1/-1">${t("common.loading")}…</p>
        </div>
      </div>`;
    const cfg = await loadConfig(token, true);
    const wrap = slot.querySelector("[data-pf-set]");
    wrap.innerHTML = P()
      .list.map((p) => {
        const row = cfg[p.key] || {};
        const creds = row.credentials && typeof row.credentials === "object" ? row.credentials : {};
        const fields = CRED_FIELDS[p.key] || [];
        return `
        <div class="pf-set-card" data-pf-plat="${p.key}">
          <div class="pf-set-head">
            ${P().badge(p.key, 28)} <b>${p.name}</b>
            <span class="spacer"></span>
            <label class="lang-chip" style="margin:0"><input type="checkbox" data-pf-enabled ${row.enabled ? "checked" : ""} /> ${t("panel.pf.enabled")}</label>
          </div>
          <label>${t("panel.pf.profileUrl")}
            <input type="url" dir="ltr" data-pf-url value="${esc(row.profile_url || "")}" placeholder="https://…" maxlength="500" />
          </label>
          <div class="pf-day">${t("panel.pf.day")}
            <select data-pf-day>
              <option value="" ${row.publish_day === null || row.publish_day === undefined ? "selected" : ""}>${t("panel.pf.every")}</option>
              ${DAY_NAMES().map((n, d) => `<option value="${d}" ${Number(row.publish_day) === d ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <details class="pf-creds">
            <summary class="pf-cred-note">${t("panel.pf.creds")} — ${credsSummary(creds, p.key)}</summary>
            <div class="pf-set-grid">
              ${fields.map((f) => `<label>${f.replace(/_/g, " ")}<input dir="ltr" data-pf-cred="${f}" type="password" autocomplete="off" placeholder="${esc(creds[f] ? "••••••" : "")}" /><input type="hidden" data-pf-cred-kept="${f}" value="${esc(String(creds[f] || ""))}" /></label>`).join("")}
              <label>${t("panel.pf.webhook")}<input dir="ltr" data-pf-cred="webhook_url" type="url" maxlength="1000" placeholder="https://…" value="${esc(creds.webhook_url || "")}" /></label>
            </div>
            ${!fields.length ? `<p class="pf-cred-note">${t("panel.pf.noApiNote")}</p>` : ""}
            <p class="pf-cred-note">${t("panel.pf.credsNote")}</p>
          </details>
          <div><button class="btn btn-sm btn-primary" type="button" data-pf-save>${t("common.save")}</button> <span class="pf-set-state muted" data-pf-state></span></div>
        </div>`;
      })
      .join("");

    slot.querySelectorAll("[data-pf-save]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-pf-plat]");
        const key = card.dataset.pfPlat;
        // a blank credential keeps the stored secret (it is never shown back);
        // a typed one replaces it. webhook_url is shown in the clear.
        const creds = {};
        card.querySelectorAll("[data-pf-cred]").forEach((inp) => {
          const f = inp.dataset.pfCred;
          const kept = card.querySelector(`[data-pf-cred-kept="${f}"]`)?.value || "";
          const typed = inp.value.trim();
          if (f === "webhook_url" ? true : typed || kept) creds[f] = typed || kept;
        });
        const dayRaw = card.querySelector("[data-pf-day]").value;
        const url = card.querySelector("[data-pf-url]").value.trim();
        if (url && !/^https:\/\/[^/?#\s<>"`]+/i.test(url)) return toast(t("panel.pf.badUrl"));
        btn.disabled = true;
        const res = await C()
          .rpc("platforms_settings_save", {
            p_token: token, p_platform: key, p_enabled: card.querySelector("[data-pf-enabled]").checked,
            p_profile_url: url, p_publish_day: dayRaw === "" ? null : Number(dayRaw), p_credentials: creds,
          })
          .catch(() => null);
        btn.disabled = false;
        const raw = JSON.stringify(res?.data || {});
        if (/staff_forbidden|staff_auth/.test(raw)) return toast(t("pa.forbidden") || raw);
        if (!res?.ok || res.data?.ok === false) {
          const reason = res?.data?.error || "";
          return toast(t(reason === "bad_url" ? "panel.pf.badUrl" : "panel.actFail"));
        }
        await loadConfig(token, true);
        const stateEl = card.querySelector("[data-pf-state]");
        if (stateEl) stateEl.textContent = "✓ " + t("panel.saved");
        setTimeout(() => stateEl && (stateEl.textContent = ""), 3000);
      })
    );
  }

  /* ────────────────────────── Panel > Platforms: the queue ── */

  const MAX_FILE = 500 * 1024 * 1024; // videos can be heavy; the bucket path is the limit

  async function uploadMedia(file, kind) {
    // into the source bucket, under the folder the project dashboard shows:
    // source/Platforms/Photos for images, source/Platforms/Videos for videos
    if (!file) return { ok: false, reason: "file" };
    if (file.size > MAX_FILE) return { ok: false, reason: "big" };
    const folder = kind === "video" ? "Platforms/Videos" : "Platforms/Photos";
    const safe = (file.name || `${kind}.bin`).replace(/[^\w.-]+/g, "-").slice(-80);
    const path = `${folder}/${Date.now()}-${safe}`;
    let res;
    try {
      res = await fetch(`${C().SUPABASE_URL}/storage/v1/object/source/${path}`, {
        method: "POST",
        headers: { apikey: C().SUPABASE_KEY, Authorization: `Bearer ${C().SUPABASE_KEY}`, "Content-Type": file.type || "application/octet-stream", "cache-control": "max-age=31536000, immutable" },
        body: file,
      });
    } catch {
      return { ok: false, reason: "network" };
    }
    if (!res.ok) return { ok: false, reason: String(res.status) };
    return { ok: true, url: `${C().SUPABASE_URL}/storage/v1/object/public/source/${path.split("/").map(encodeURIComponent).join("/")}` };
  }

  function chipHtml(p, cfgRow, checked) {
    return `<label class="pf-plat-chip${checked ? " on" : ""}" data-pf-chip="${p.key}">
      <input type="checkbox" ${checked ? "checked" : ""} ${cfgRow && cfgRow.enabled === false && !cfgRow.credentials ? "" : ""} />
      ${P().badge(p.key, 20)} ${p.name}
      <span class="pf-day-tag">${dayLabel(cfgRow?.publish_day)}</span>
    </label>`;
  }

  async function view(section, main, ctx) {
    if (section !== "platforms") return false;
    const token = ctx?.token ? ctx.token() : "";
    main.innerHTML = `
      <p class="eyebrow">${t("panel.nav.platforms")}</p>
      <h1>${t("panel.pf.title")}</h1>
      <p class="muted">${t("panel.pf.lead")}</p>
      <div class="stack">
        <section class="pf-box" data-composer>
          <h3 style="margin:0">${t("panel.pf.composer.t")}</h3>
          <label>${t("panel.pf.titleLbl")}<input type="text" data-c-title maxlength="300" placeholder="${esc(t("panel.pf.titlePh"))}" /></label>
          <label>${t("panel.pf.descLbl")}<textarea data-c-desc rows="4" maxlength="12000" placeholder="${esc(t("panel.pf.descPh"))}"></textarea></label>
          <label>${t("panel.pf.tagsLbl")}<input type="text" data-c-tags dir="ltr" maxlength="400" placeholder="movie, cineaura, 2026" /></label>
          <div>
            <div class="sset-lbl" style="font-size:12px;color:var(--muted);margin-bottom:6px">${t("panel.pf.media")}</div>
            <div class="pf-media-tabs" role="radiogroup">
              <button type="button" data-c-media="none" class="on">${t("panel.pf.mediaNone")}</button>
              <button type="button" data-c-media="image">${t("panel.pf.mediaImage")}</button>
              <button type="button" data-c-media="video">${t("panel.pf.mediaVideo")}</button>
            </div>
          </div>
          <div data-c-media-box hidden>
            <label>${t("panel.pf.urlLbl")}<input type="url" dir="ltr" data-c-url maxlength="2000" placeholder="https://…" /></label>
            <label>${t("panel.pf.orUpload")} <input type="file" data-c-file hidden /></label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-sm btn-ghost" type="button" data-c-up>${t("panel.pf.upload")}</button>
              <span class="muted" data-c-up-state></span>
            </div>
            <div data-c-preview style="margin-top:8px"></div>
          </div>
          <div>
            <div class="sset-lbl" style="font-size:12px;color:var(--muted);margin-bottom:6px">${t("panel.pf.platforms")}</div>
            <div class="pf-plats" data-c-plats></div>
          </div>
          <div><button class="btn btn-primary" type="button" data-c-save>${t("panel.pf.save")}</button></div>
        </section>
        <section class="pf-box">
          <h3 style="margin:0">${t("panel.pf.posts")}</h3>
          <div class="pf-posts" data-c-list><p class="muted">${t("common.loading")}…</p></div>
        </section>
      </div>`;

    const cfg = await loadConfig(token, true);
    const box = main.querySelector("[data-c-plats]");
    box.innerHTML = P().list.map((p) => chipHtml(p, cfg[p.key], true)).join("");
    box.addEventListener("change", (e) => {
      const chip = e.target.closest("[data-pf-chip]");
      if (chip) chip.classList.toggle("on", chip.querySelector("input").checked);
    });

    // media tab picker
    let mediaType = "none";
    const mediaBox = main.querySelector("[data-c-media-box]");
    main.querySelectorAll("[data-c-media]").forEach((b) =>
      b.addEventListener("click", () => {
        mediaType = b.dataset.cMedia;
        main.querySelectorAll("[data-c-media]").forEach((x) => x.classList.toggle("on", x === b));
        mediaBox.hidden = mediaType === "none";
      })
    );

    // the media controls live inside the swap-capable body, so they are always
    // re-resolved (delegated listeners) instead of bound to one node
    const cur = () => ({
      url: main.querySelector("[data-c-url]"),
      file: main.querySelector("[data-c-file]"),
      up: main.querySelector("[data-c-up]"),
      upState: main.querySelector("[data-c-up-state]"),
      preview: main.querySelector("[data-c-preview]"),
    });
    const paintPreview = () => {
      const { url, preview } = cur();
      const u = (url?.value || "").trim();
      if (preview) preview.innerHTML = u
        ? mediaType === "image"
          ? `<img class="pf-media-preview" src="${esc(u)}" alt="" onerror="this.remove()" />`
          : `<video class="pf-media-preview" src="${esc(u)}" controls></video>`
        : "";
    };
    main.addEventListener("change", async (e) => {
      const tEl = e.target;
      if (!(tEl instanceof Element)) return;
      if (tEl.matches("[data-c-url]")) return paintPreview();
      if (!tEl.matches("[data-c-file]")) return;
      const f = tEl.files?.[0];
      if (!f) return;
      const { upState, url } = cur();
      if (upState) upState.textContent = t("panel.pf.uploading");
      const r = await uploadMedia(f, mediaType === "video" ? "video" : "image");
      tEl.value = "";
      if (r.ok) {
        if (upState) upState.textContent = t("panel.pf.uploadOk");
        if (url) url.value = r.url;
        paintPreview();
      } else if (upState) {
        upState.textContent = t("panel.pf.uploadFail") + " (" + r.reason + ")";
      }
    });
    main.addEventListener("click", (e) => {
      const up = e.target?.closest?.("[data-c-up]");
      if (!up || !main.contains(up)) return;
      cur().file?.click();
    });

    const listEl = main.querySelector("[data-c-list]");
    async function drawPosts() {
      const res = await C().rpc("platform_posts_list", { p_token: token });
      const rows = res?.ok && Array.isArray(res.data) ? res.data : [];
      if (!rows.length) {
        listEl.innerHTML = `<p class="muted">${t("panel.pf.empty")}</p>`;
        return;
      }
      listEl.innerHTML = rows
        .map((r) => {
          const plats = (r.platforms || [])
            .map((k) => {
              const c2 = cfg[k] || {};
              const res2 = (r.results || {})[k];
              const mark = res2 ? `${res2.ok ? "✓" : "✗"}` : "•";
              return `<span class="pf-plat-chip" style="cursor:default" title="${esc(res2?.detail || "")}">${P().badge(k, 20)} ${P().info(k).name} <span class="pf-day-tag">${dayLabel(r.publish_day ?? c2.publish_day)} ${mark}</span></span>`;
            })
            .join("");
          const tags = (r.tags || []).map((x) => `<span>#${esc(x)}</span>`).join("");
          const media = r.media_url
            ? `<a href="${esc(r.media_url)}" target="_blank" rel="noopener noreferrer">${t(r.media_type === "video" ? "panel.pf.mediaVideo" : "panel.pf.mediaImage")} ↗</a>`
            : t("panel.pf.mediaNone");
          return `<article class="pf-post" data-post-id="${esc(r.id)}">
            <div class="pf-post-top">
              <b dir="auto">${esc(r.title)}</b>
              <span class="pf-state ${esc(r.state)}">${t("panel.pf.state." + r.state)}</span>
            </div>
            ${r.description ? `<div class="pf-post-desc" dir="auto">${esc(r.description.length > 280 ? r.description.slice(0, 280) + "…" : r.description)}</div>` : ""}
            ${tags ? `<div class="pf-post-tags" dir="ltr">${tags}</div>` : ""}
            <div class="pf-post-plats">${plats}</div>
            <div class="pf-post-meta">
              <span>${media}</span>
              <span>${esc(t("panel.pf.by", { name: r.created_by || "—" }))}</span>
              <span>${esc(new Date(r.created_at).toLocaleString())}</span>
            </div>
            <div class="pf-post-actions">
              ${r.state === "failed" || r.state === "partial" || r.state === "published" ? `<button class="btn btn-sm btn-ghost" type="button" data-act="requeue">${t("panel.pf.requeue")}</button>` : ""}
              <button class="btn btn-sm btn-danger" type="button" data-act="delete">${t("panel.pf.delete")}</button>
            </div>
          </article>`;
        })
        .join("");
    }
    await drawPosts();

    listEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.closest("[data-post-id]")?.dataset.postId;
      if (!id) return;
      btn.disabled = true;
      if (btn.dataset.act === "delete") {
        await C().rpc("platform_post_delete", { p_token: token, p_id: id });
      } else {
        await C().rpc("platform_post_state", { p_token: token, p_id: id, p_state: "pending" });
      }
      await drawPosts();
    });

    main.querySelector("[data-c-save]").addEventListener("click", async () => {
      const title = main.querySelector("[data-c-title]").value.trim();
      const description = main.querySelector("[data-c-desc]").value.trim();
      const tags = main.querySelector("[data-c-tags]").value.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean);
      const mediaUrl = mediaType === "none" ? "" : (cur().url?.value || "").trim();
      const plats = [...box.querySelectorAll("[data-pf-chip] input:checked")].map((i) => i.closest("[data-pf-chip]").dataset.pfChip);
      if (!title) return toast(t("panel.pf.noTitle"));
      if (!plats.length) return toast(t("panel.pf.noPlatforms"));
      if (mediaType !== "none" && !/^https?:\/\/[^/?#\s<>"`]+[^s<>"`]*$/i.test(mediaUrl)) return toast(t("panel.pf.badUrl"));
      const res = await C()
        .rpc("platform_post_save", { p_token: token, p_id: null, p_title: title, p_description: description, p_tags: tags, p_media_type: mediaType, p_media_url: mediaUrl, p_platforms: plats })
        .catch(() => null);
      if (!res?.ok || res.data?.ok === false) {
        const reason = res?.data?.error || String(res?.data?.message || "");
        toast(t(reason === "no_title" ? "panel.pf.noTitle" : reason === "no_platform" ? "panel.pf.noPlatforms" : reason === "bad_media_url" ? "panel.pf.badUrl" : /forbidden|auth/.test(reason) ? "pa.forbidden" : "panel.actFail"));
        return;
      }
      toast(t("panel.pf.saved"));
      main.querySelector("[data-c-title]").value = "";
      main.querySelector("[data-c-desc]").value = "";
      main.querySelector("[data-c-tags]").value = "";
      if (cur().url) cur().url.value = "";
      if (cur().preview) cur().preview.innerHTML = "";
      await drawPosts();
    });

    return true;
  }

  window.CineAuraPlatformsPanel = {
    has: (s) => s === "platforms",
    view,
    renderSettings,
  };
})();
