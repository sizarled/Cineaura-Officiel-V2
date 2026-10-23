  // New article opens the one rich editor (article-Editor.html). Members reach it from
  // Create, the hub and the Studio; staff from the Panel — same page, same code.
  function articleForm(box) {
    if (!meId()) return (box.innerHTML = loginNote());
    box.innerHTML = `<div class="com-form glass" style="text-align:center">
        <p class="com-body">${esc(t("ae.redirect"))}</p>
        <a class="btn btn-primary" href="./article-Editor.html">${esc(t("ae.openEditor"))}</a>
      </div>`;
    location.href = "./article-Editor.html";
  }

/* CineAura — Community hub (js/community.js, sql/community.sql)
   Articles + Questions & Answers in one place. Public to browse; a signed-in
   member asks, answers, votes "helpful" and publishes articles.
   Deep links: community.html · #ask · #new-article · #q/123 · #a/45 · #articles
   The profile renders its Community section through memberView(main, memberId). */
(() => {
  const C = () => window.CineAura;
  const esc = (v) =>
    C() && C().escapeHtml
      ? C().escapeHtml(v)
      : String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const t = (k, vars) => (C() && C().t ? C().t(k, vars) : k);
  const toast = (m) => (C() && C().toast ? C().toast(m) : alert(m));
  const req = (...args) => C().supabaseRequest(...args);
  const meId = () => C() && C().getSession ? C().getSession()?.member_id || "" : "";
  const idsIn = (ids) => ids.map((x) => String(x).replace(/[,"\\]/g, "")).join(",");

  // member_id -> @username, one REST round trip per batch.
  async function nameMap(ids) {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return new Map();
    const res = await req(`/rest/v1/members?member_id=in.(${idsIn(uniq)})&select=member_id,username`);
    const rows = res.ok && Array.isArray(res.data) ? res.data : [];
    return new Map(rows.map((r) => [r.member_id, r.username]));
  }
  const who = (names, id) => (names.get(id) ? `@${names.get(id)}` : "");
  const when = (iso) => String(iso || "").slice(0, 16).replace("T", " ");
  // Question/article links: relative #… on the hub itself, absolute ./community.html#…
  // when the same renderer is embedded on another page (the type pages, the profile).
  const base = () => (document.getElementById("com-root") ? "" : "./community.html");
  const loginNote = () =>
    meId() ? "" : `<p class="com-note muted">${esc(t("com.login"))} <a class="btn btn-sm btn-primary" href="./login.html">${esc(t("nav.signin"))}</a></p>`;

  const gLink = (id) => (base() ? `${base()}?group=${id}` : `?group=${id}`);
  // Deep links: on the hub the detail views live under #q/ #a/ hashes; everywhere
  // else they point at the page that owns the type, one id on it (round 39):
  // articles.html?id= / answers.html?id= (one question or one answer).
  const DEEP_PAGE = { article: "articles", question: "answers", answer: "answers" };
  // The list a detail view goes back to: its own type's page (the hub keeps its
  // own tabs, so # there; everywhere else a real page).
  const listHref = (kind) => (document.getElementById("com-root") ? (kind === "article" ? "#articles" : "#questions") : `./${DEEP_PAGE[kind]}.html`);
  const dLink = (kind, id) =>
    document.getElementById("com-root")
      ? `#${kind === "article" ? "a" : "q"}/${id}`
      : `./${DEEP_PAGE[kind] || "answers"}.html?id=${encodeURIComponent(id)}`;
  const groupParam = () => new URLSearchParams(location.search).get("group");
  // Community.html?group=12345 picks the group page; plain Community.html picks
  // the list. #g/123 stays as a legacy alias so old links never break.
  const gTab = () => {
    const h = String(location.hash || "").replace(/^#/, "");
    return ["about", "members"].includes(h) ? h : "posts";
  };
  const hashRoute = () => {
    const gp = groupParam();
    if (gp) return { view: "group", id: Number(gp) };
    const h = String(location.hash || "").replace(/^#/, "");
    const m = h.match(/^(q|a|g)\/(\d+)$/);
    if (m) return { view: m[1] === "q" ? "question" : m[1] === "a" ? "article" : "group", id: Number(m[2]) };
    if (h === "ask") return { view: "ask" };
    if (h === "new-article") return { view: "newArticle" };
    if (h === "articles") return { view: "list", tab: "articles" };
    if (h === "questions") return { view: "list", tab: "questions" };
    if (h === "my-groups") return { view: "groups", tab: "my" };
    if (h === "new-group") return { view: "newGroup" };
    return { view: "groups", tab: "discover" };
  };

  // ─────────────────────────── write helpers ───────────────────────────
  async function insertRow(path, payload) {
    const res = await req(path, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (res.ok && Array.isArray(res.data) && res.data[0]) return res.data[0];
    toast(t("com.saveFail"));
    return null;
  }

  // ─────────────────────────── questions ───────────────────────────
  async function listQuestions(box) {
    const [res, arts] = await Promise.all([
      req("/rest/v1/community_questions?select=*&order=created_at.desc&limit=80"),
      Promise.resolve(null),
    ]);
    const rows = res.ok && Array.isArray(res.data) ? res.data : [];
    if (!res.ok) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))}</p>`);
    if (!rows.length)
      return (box.innerHTML = `<p class="com-empty muted">${esc(t("com.emptyQ"))} <a class="btn btn-sm btn-primary" href="#ask">${esc(t("com.ask"))}</a></p>`);
    const names = await nameMap(rows.map((r) => r.member_id));
    box.innerHTML = rows
      .map(
        (q) => `<a class="com-row glass" href="${dLink("question", q.id)}">
          <span class="com-row-main"><strong>${esc(q.title)}</strong>
          <span class="muted">${esc(who(names, q.member_id))} · ${esc(when(q.created_at))}</span></span>
          <span class="com-chip">💬 ${q.answers_count || 0} ${esc(t("com.answersN"))}</span>
        </a>`
      )
      .join("");
  }

  function askForm(box) {
    if (!meId()) return (box.innerHTML = loginNote());
    box.innerHTML = `<form id="com-ask" class="com-form glass">
      <input name="title" maxlength="200" required placeholder="${esc(t("com.qTitle"))}" />
      <textarea name="details" rows="5" placeholder="${esc(t("com.detailsPh"))}"></textarea>
      <div><button class="btn btn-primary" type="submit">${esc(t("com.postQ"))}</button>
      <button class="btn btn-ghost" type="button" onclick="location.hash=''">${esc(t("common.cancel"))}</button></div>
    </form>`;
    box.querySelector("#com-ask").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = await insertRow("/rest/v1/community_questions", {
        member_id: meId(),
        title: String(fd.get("title") || "").trim(),
        details: String(fd.get("details") || "").trim(),
      });
      if (row) {
        toast(t("com.saved"));
        location.hash = `#q/${row.id}`;
      }
    };
  }

  // ?answer=ID — the answer with its parent question (Round-60 spec).
  async function answerView(box, id) {
    const res = await req(`/rest/v1/community_answers?id=eq.${id}&select=*`);
    const a = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    if (!a) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("ct.missing"))} <a href="${listHref("answer")}">${esc(t("ct.library"))}</a></p>`);
    questionView(box, a.question_id, a.id);
  }

  async function questionView(box, id, hlAnswerId) {
    const res = await req(`/rest/v1/community_questions?id=eq.${id}&select=*`);
    const q = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    if (!q) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))} <a href="${listHref("question")}">${esc(t("com.backList"))}</a></p>`);
    const [ansRes, names] = await Promise.all([
      req(`/rest/v1/community_answers?question_id=eq.${id}&select=*&order=votes.desc,created_at.asc&limit=200`),
      nameMap([q.member_id]),
    ]);
    const answers = ansRes.ok && Array.isArray(ansRes.data) ? ansRes.data : [];
    const names2 = await nameMap(answers.map((a) => a.member_id));
    names2.forEach((v, k) => names.set(k, v));
    const me = meId();
    const ids = answers.map((a) => a.id);
    let mine = new Set();
    if (me && ids.length) {
      const vr = await req(`/rest/v1/community_answer_votes?member_id=eq.${encodeURIComponent(me)}&answer_id=in.(${idsIn(ids)})&select=answer_id`);
      if (vr.ok && Array.isArray(vr.data)) mine = new Set(vr.data.map((v) => v.answer_id));
    }
    box.innerHTML = `<a class="com-back" href="${listHref("question")}">← ${esc(t("com.backList"))}</a>
      <article class="com-q glass">
        <h2>${esc(q.title)}</h2>
        <p class="muted">${esc(who(names, q.member_id))} · ${esc(when(q.created_at))}</p>
        ${q.details ? `<p class="com-body">${esc(q.details)}</p>` : ""}
      </article>
      <h3 class="com-h3">💬 ${answers.length} ${esc(t("com.answersN"))}</h3>
      <div id="com-answers">${answers
        .map(
          (a) => `<div class="com-answer glass${a.id === hlAnswerId ? " com-hl" : ""}" data-ans="${a.id}">
            <p class="com-body">${esc(a.body)}</p>
            <div class="com-a-foot">
              <span class="muted">${esc(who(names2, a.member_id))} · ${esc(when(a.created_at))}</span>
              <button type="button" class="btn btn-sm ${mine.has(a.id) ? "btn-primary" : "btn-ghost"}" data-vote="${a.id}" ${me && a.member_id !== me ? "" : me ? "disabled" : "disabled"}>👍 ${a.votes || 0} ${esc(t("com.helpful"))}</button>
            </div>
          </div>`
        )
        .join("")}</div>
      ${
        me
          ? `<form id="com-answer" class="com-form glass">
              <textarea name="body" rows="4" required placeholder="${esc(t("com.write"))}"></textarea>
              <div><button class="btn btn-primary" type="submit">${esc(t("com.postA"))}</button></div>
            </form>`
          : loginNote()
      }`;
    box.querySelectorAll("[data-vote]").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const aid = Number(b.dataset.vote);
        const has = mine.has(aid);
        const r = await req(
          has
            ? `/rest/v1/community_answer_votes?answer_id=eq.${aid}&member_id=eq.${encodeURIComponent(meId())}`
            : `/rest/v1/community_answer_votes?select=answer_id,member_id`,
          has
            ? { method: "DELETE" }
            : { method: "POST", body: JSON.stringify({ answer_id: aid, member_id: meId() }) }
        );
        if (!r.ok) toast(t("com.saveFail"));
        questionView(box, id);
      };
    });
    if (hlAnswerId) {
      const tur = box.querySelector(`[data-ans="${hlAnswerId}"]`);
      if (tur) tur.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const f = box.querySelector("#com-answer");
    if (f)
      f.onsubmit = async (e) => {
        e.preventDefault();
        const body = String(new FormData(f).get("body") || "").trim();
        if (!body) return;
        const row = await insertRow("/rest/v1/community_answers", { question_id: id, member_id: meId(), body });
        if (row) questionView(box, id);
      };
  }

  // ─────────────────────────── articles ───────────────────────────
  async function listArticles(box) {
    const res = await req("/rest/v1/community_articles?select=*&order=created_at.desc&limit=80");
    const rows = res.ok && Array.isArray(res.data) ? res.data : [];
    if (!res.ok) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))}</p>`);
    if (!rows.length)
      return (box.innerHTML = `<p class="com-empty muted">${esc(t("com.emptyA"))} <a class="btn btn-sm btn-primary" href="#new-article">${esc(t("com.newArticle"))}</a></p>`);
    const names = await nameMap(rows.map((r) => r.member_id));
    box.innerHTML = rows
      .map(
        (a) => `<a class="com-row glass" href="${dLink("article", a.id)}">
          <span class="com-row-main"><strong>${esc(a.title)}</strong>
          <span class="muted">${esc(who(names, a.member_id))} · ${esc(when(a.created_at))}${a.tags ? ` · ${esc(a.tags)}` : ""}</span></span>
          <span class="com-chip">👁 ${a.views || 0}</span>
        </a>`
      )
      .join("");
  }

  function articleForm(box) {
    if (!meId()) return (box.innerHTML = loginNote());
    box.innerHTML = `<form id="com-art" class="com-form glass">
      <input name="title" maxlength="200" required placeholder="${esc(t("com.artTitle"))}" />
      <input name="tags" maxlength="120" placeholder="${esc(t("com.tagsPh"))}" />
      <textarea name="body" rows="10" required placeholder="${esc(t("com.bodyPh"))}"></textarea>
      <div><button class="btn btn-primary" type="submit">${esc(t("com.publish"))}</button>
      <button class="btn btn-ghost" type="button" onclick="location.hash='#articles'">${esc(t("common.cancel"))}</button></div>
    </form>`;
    box.querySelector("#com-art").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = await insertRow("/rest/v1/community_articles", {
        member_id: meId(),
        title: String(fd.get("title") || "").trim(),
        tags: String(fd.get("tags") || "").trim(),
        body: String(fd.get("body") || "").trim(),
      });
      if (row) {
        toast(t("com.saved"));
        location.hash = `#a/${row.id}`;
      }
    };
  }

  // Article page: the rich body from article-Editor.html, plus the same privacy gate the
  // editor promises (private = listed people, exclusive = every criterion).
  async function articleView(box, id) {
    const A = window.CineAuraArticles;
    const res = await req(`/rest/v1/community_articles?id=eq.${id}&select=*`);
    const a = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    const back = listHref("article");
    if (!a) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))} <a href="${back}">${esc(t("com.backList"))}</a></p>`);

    const names = await nameMap([a.member_id]);
    const mine = meId() && meId() === a.member_id;
    if (!mine)
      req(`/rest/v1/community_articles?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ views: Number(a.views || 0) + 1 }),
      }).catch(() => {});

    // A draft (or a Help article awaiting a moderator) is not public yet.
    if (a.status === "draft" && !mine)
      return (box.innerHTML = `<a class="com-back" href="${back}">← ${esc(t("com.backList"))}</a>
        <p class="com-note">🔒 ${esc(t("ae.notPublished"))}</p>`);

    // Who is looking: the member row carries the level / country used by exclusive.
    let viewer = meId() ? { member_id: meId(), username: (C()?.getSession?.()?.username || ""), profile: {} } : null;
    if (viewer) {
      const pr = await req(`/rest/v1/members?member_id=eq.${encodeURIComponent(meId())}&select=username,country,language,level,tier`);
      const p = pr.ok && Array.isArray(pr.data) ? pr.data[0] : null;
      if (p) viewer = { ...viewer, username: p.username || viewer.username, profile: p };
    }
    const staff = false;
    const allowed = A ? A.canRead(a, viewer, staff) : true;

    const cover = a.thumb ? `<img class="ar-cover" src="${esc(a.thumb)}" alt="" loading="lazy" />` : "";
    const cats = String(a.categories || a.tags || "").split(",").map((x) => x.trim()).filter(Boolean);
    const head = `<a class="com-back" href="${back}">← ${esc(t("com.backList"))}</a>
      <article class="com-article glass">
        ${cover}
        <h2>${esc(a.title)}</h2>
        <p class="muted">${esc(who(names, a.member_id))} · ${esc(when(a.publish_at || a.created_at))}${a.language ? ` · ${esc(a.language)}` : ""} · 👁 ${(a.views || 0) + 1}${mine ? ` · <a href="./article-Editor.html?edit=${encodeURIComponent(a.id)}">${esc(t("ae.edit"))}</a>` : ""}</p>
        ${cats.length ? `<p>${cats.map((c) => `<span class="ar-chip">${esc(c)}</span>`).join("")}</p>` : ""}
      </article>`;

    if (!allowed) {
      const c = A ? A.critOf(a) : {};
      const list = [
        c.followers ? t("ae.followersOnly") : "",
        c.countries?.length ? `${t("ae.country")}: ${c.countries.join(", ")}` : "",
        c.languages?.length ? `${t("ae.language")}: ${c.languages.join(", ")}` : "",
        `${t("ae.level")}: ${c.lvMin ?? 0} – ${c.lvMax ?? 10}`,
        c.tier ? `${t("ae.tier")}: ${c.tier}` : "",
      ].filter(Boolean);
      return (box.innerHTML = `${head}
        <div class="glass" style="padding:22px;text-align:center">
          <p style="font-size:26px">🔒</p>
          <h3>${esc(a.visibility === "private" ? t("ae.privateGate") : t("ae.exclusiveGate"))}</h3>
          ${a.visibility === "private" ? `<p class="muted">${esc(t("ae.privateGateText"))}</p>` : `<ul class="muted" style="list-style:none;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;padding:0">${list.map((x) => `<li class="ar-chip">${esc(x)}</li>`).join("")}</ul>`}
        </div>`);
    }

    const body = A ? A.bodyHtml(a) : `<p class="com-body">${esc(a.body || "")}</p>`;
    box.innerHTML = `${head}
      <article class="com-article glass">
        ${a.description ? `<p class="lead" style="color:var(--muted,#9bb0c2);font-size:16px">${esc(a.description)}</p>` : ""}
        <div class="ar-body">${body}</div>
      </article>`;
  }

  // ─────────────────────────── groups ───────────────────────────
  async function listGroups(box, mine) {
    const me = meId();
    const res = mine && me
      ? await req(`/rest/v1/community_group_members?member_id=eq.${encodeURIComponent(me)}&select=group_id,community_groups(*)`)
      : await req(`/rest/v1/community_groups?is_public=eq.true&select=*&order=created_at.desc&limit=80`);
    if (!res.ok) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("grp.loadFail"))}</p>`);
    const rows = mine && me
      ? (Array.isArray(res.data) ? res.data.map((r) => r.community_groups).filter(Boolean) : [])
      : (Array.isArray(res.data) ? res.data : []);
    if (!rows.length)
      return (box.innerHTML = `<p class="com-empty muted">${esc(t(mine ? "grp.emptyMy" : "grp.empty"))} ${me ? `<a class="btn btn-sm btn-primary" href="#new-group">${esc(t("grp.create"))}</a>` : ""}</p>`);
    const names = await nameMap(rows.map((g) => g.owner_id));
    box.innerHTML = rows
      .map(
        (g) => `<a class="com-row glass" href="${gLink(g.id)}">
          ${g.cover ? `<img class="com-grp-cover" src="${esc(g.cover)}" alt="" loading="lazy" />` : `<span class="com-grp-cover com-grp-ph">👥</span>`}
          <span class="com-row-main"><strong>${esc(g.name)}</strong>
          <span class="muted">${esc(String(g.description || "").slice(0, 90))}</span>
          <span class="muted">${esc(t("grp.byOwner", { name: who(names, g.owner_id) }))}</span></span>
          <span class="com-chip">👥 ${g.members_count || 0} ${esc(t("grp.members"))}</span>
        </a>`
      )
      .join("");
  }

  // Create (no arg) or edit (an existing group row). Edits verify ownership when
  // the Save actually runs — hiding the button would not be a permission system.
  function groupForm(box, existing) {
    if (!meId()) return (box.innerHTML = loginNote());
    const g = existing || {};
    box.innerHTML = `<form id="com-grp" class="com-form glass">
      <input name="name" maxlength="120" required value="${esc(g.name || "")}" placeholder="${esc(t("grp.namePh"))}" />
      <textarea name="description" rows="3" placeholder="${esc(t("grp.descPh"))}">${esc(g.description || "")}</textarea>
      <textarea name="rules" rows="3" placeholder="${esc(t("grp.rulesPh"))}">${esc(g.rules || "")}</textarea>
      <input name="cover" maxlength="300" value="${esc(g.cover || "")}" placeholder="${esc(t("grp.coverPh"))}" />
      <label class="lang-chip"><input type="checkbox" name="is_public" ${g.is_public === false ? "" : "checked"} /> ${esc(t("grp.public"))}</label>
      <div><button class="btn btn-primary" type="submit">${esc(existing ? t("grp.update") : t("grp.createBtn"))}</button>
      <button class="btn btn-ghost" type="button" onclick="history.back()">${esc(t("common.cancel"))}</button></div>
    </form>`;
    box.querySelector("#com-grp").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const patch = {
        name: String(fd.get("name") || "").trim(),
        description: String(fd.get("description") || "").trim(),
        rules: String(fd.get("rules") || "").trim(),
        cover: String(fd.get("cover") || "").trim(),
        is_public: fd.get("is_public") === "on",
      };
      if (existing) {
        // ownership is re-read from the row at execution time, not from the UI
        const fresh = await req(`/rest/v1/community_groups?id=eq.${existing.id}&select=owner_id`);
        const owner = fresh.ok && Array.isArray(fresh.data) && fresh.data[0] ? fresh.data[0].owner_id : "";
        if (owner !== meId()) return toast(t("grp.notOwner"));
        const r = await req(`/rest/v1/community_groups?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        if (!r.ok) return toast(t("grp.saveFail"));
        toast(t("grp.saved"));
        location.href = gLink(existing.id);
        return;
      }
      const row = await insertRow("/rest/v1/community_groups", { owner_id: meId(), ...patch });
      if (!row) return;
      // seat the owner (so the member count and My Groups include it) then open the group
      req("/rest/v1/community_group_members?select=group_id,member_id", {
        method: "POST",
        body: JSON.stringify({ group_id: row.id, member_id: meId(), role: "owner" }),
      })
        .catch(() => {})
        .finally(() => {
          toast(t("grp.saved"));
          location.href = gLink(row.id);
        });
    };
  }

  async function groupView(box, id) {
    const res = await req(`/rest/v1/community_groups?id=eq.${id}&select=*`);
    const g = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    if (!g) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("grp.loadFail"))} <a href="${base() || "community.html"}">${esc(t("com.backList"))}</a></p>`);
    const me = meId();
    let role = "";
    if (me) {
      const mr = await req(`/rest/v1/community_group_members?group_id=eq.${id}&member_id=eq.${encodeURIComponent(me)}&select=role`);
      role = mr.ok && Array.isArray(mr.data) && mr.data[0] ? mr.data[0].role || "member" : "";
    }
    const joined = !!role;
    const isOwner = g.owner_id === me || role === "owner";
    const names = await nameMap([g.owner_id]);
    const back = `<a class="com-back" href="${base() || "community.html"}">← ${esc(t("grp.backList"))}</a>`;
    // Private group, non-member: the gate is decided here, not by hiding buttons.
    if (!g.is_public && !joined) {
      box.innerHTML = `${back}
        ${g.cover ? `<img class="com-grp-hero" src="${esc(g.cover)}" alt="" loading="lazy" />` : ""}
        <h2>${esc(g.name)} 🔒</h2><p class="com-note">${esc(t("grp.privateText"))}</p>`;
      return;
    }
    const tab = gTab();
    const header = `${back}
      <article class="com-q com-grp glass">
        ${g.cover ? `<img class="com-grp-hero" src="${esc(g.cover)}" alt="" loading="lazy" />` : ""}
        <h2>${esc(g.name)} ${g.is_public ? "" : "🔒"}</h2>
        <p class="muted">${esc(t("grp.byOwner", { name: who(names, g.owner_id) }))} · 👥 ${g.members_count || 0} ${esc(t("grp.members"))} · 💬 ${g.posts_count || 0} ${esc(t("grp.postsN"))}</p>
        <div class="com-acts" style="margin-top:12px">
          ${me ? `<button type="button" class="btn btn-sm ${joined ? "btn-ghost" : "btn-primary"}" id="com-join">${joined ? esc(t("grp.leave")) : esc(t("grp.join"))}</button>` : ""}
          ${isOwner ? `<button type="button" class="btn btn-sm btn-ghost" id="com-gedit">✎ ${esc(t("grp.edit"))}</button>` : ""}
          ${me && !isOwner ? `<button type="button" class="btn btn-sm btn-ghost" id="com-greport">🚩 ${esc(t("grp.report"))}</button>` : ""}
          ${!me ? loginNote() : ""}
        </div>
        <div class="com-tabs" role="tablist" style="margin-top:14px">
          <button type="button" role="tab" class="follow-tab${tab === "posts" ? " active" : ""}" data-gviewtab="posts">💬 ${esc(t("grp.tab.posts"))}</button>
          <button type="button" role="tab" class="follow-tab${tab === "about" ? " active" : ""}" data-gviewtab="about">ℹ️ ${esc(t("grp.tab.about"))}</button>
          <button type="button" role="tab" class="follow-tab${tab === "members" ? " active" : ""}" data-gviewtab="members">👥 ${esc(t("grp.tab.members"))}</button>
        </div>
      </article>
      <div id="com-gbody"></div>`;
    box.innerHTML = header;
    box.querySelectorAll("[data-gviewtab]").forEach((b) => (b.onclick = () => (location.hash = b.dataset.gviewtab === "posts" ? "" : `#${b.dataset.gviewtab}`)));
    const jb = box.querySelector("#com-join");
    if (jb)
      jb.onclick = async () => {
        jb.disabled = true;
        // membership is re-checked from the row at execution time
        const chk = await req(`/rest/v1/community_group_members?group_id=eq.${id}&member_id=eq.${encodeURIComponent(me)}&select=role`);
        const has = chk.ok && Array.isArray(chk.data) && chk.data.length > 0;
        const r = await req(
          has
            ? `/rest/v1/community_group_members?group_id=eq.${id}&member_id=eq.${encodeURIComponent(me)}`
            : `/rest/v1/community_group_members?select=group_id,member_id`,
          has ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ group_id: id, member_id: me }) }
        );
        if (!r.ok) toast(t("grp.saveFail"));
        groupView(box, id);
      };
    const ed = box.querySelector("#com-gedit");
    if (ed) ed.onclick = () => groupViewEdit(box, id);
    const rp = box.querySelector("#com-greport");
    if (rp)
      rp.onclick = async () => {
        rp.disabled = true;
        const note = prompt(t("grp.reportPh") || "");
        if (note === null) return (rp.disabled = false);
        const r = await req("/rest/v1/community_group_reports?select=group_id,reporter_id", {
          method: "POST",
          body: JSON.stringify({ group_id: id, reporter_id: me, note: String(note || "").trim() }),
        });
        if (r.ok) toast(t("grp.reported"));
        else if (String(r.status) === "409") toast(t("grp.reported"));
        else toast(t("grp.saveFail"));
      };
    const body = box.querySelector("#com-gbody");
    if (tab === "about") return drawGroupAbout(body, g);
    if (tab === "members") return drawGroupMembers(body, g, isOwner, me);
    return drawGroupPosts(body, g, joined, isOwner, me);
  }

  function drawGroupAbout(body, g) {
    body.innerHTML = `<div class="com-grp glass" style="padding:18px;border-radius:18px">
      ${g.description ? `<p class="com-body">${esc(g.description)}</p>` : `<p class="muted">${esc(t("grp.noDesc"))}</p>`}
      ${g.rules ? `<h3 class="com-h3">${esc(t("grp.rulesTitle"))}</h3><p class="com-body">${esc(g.rules)}</p>` : ""}
      <p class="muted" style="margin-top:10px">${esc(when(g.created_at))}</p>
    </div>`;
  }

  async function drawGroupMembers(body, g, isOwner, me) {
    const res = await req(`/rest/v1/community_group_members?group_id=eq.${g.id}&select=*&order=created_at.asc&limit=200`);
    const rows = res.ok && Array.isArray(res.data) ? res.data : [];
    const names = await nameMap(rows.map((r) => r.member_id));
    body.innerHTML = rows.length
      ? rows
          .map(
            (r) => `<div class="com-mem-row glass">
              <span><strong>${esc(who(names, r.member_id) || r.member_id)}</strong>${r.role === "owner" ? ` <span class="com-chip">${esc(t("grp.ownerTag"))}</span>` : ""}</span>
              <span class="muted">${esc(when(r.created_at))}</span>
              ${isOwner && r.role !== "owner" ? `<button type="button" class="btn btn-sm btn-danger" data-mdel="${esc(r.member_id)}">🗑 ${esc(t("grp.remove"))}</button>` : ""}
            </div>`
          )
          .join("")
      : `<p class="com-empty muted">${esc(t("grp.noMembers"))}</p>`;
    body.querySelectorAll("[data-mdel]").forEach((b) => {
      b.onclick = async () => {
        // only the group owner may remove; the group row is the authority here
        if (g.owner_id !== me) return toast(t("grp.notOwner"));
        const r = await req(`/rest/v1/community_group_members?group_id=eq.${g.id}&member_id=eq.${encodeURIComponent(b.dataset.mdel)}`, { method: "DELETE" });
        if (!r.ok) return toast(t("grp.saveFail"));
        drawGroupMembers(body, g, isOwner, me);
      };
    });
  }

  async function drawGroupPosts(body, g, joined, isOwner, me) {
    const res = await req(`/rest/v1/community_group_posts?group_id=eq.${g.id}&select=*&order=created_at.desc&limit=100`);
    const rows = res.ok && Array.isArray(res.data) ? res.data : [];
    const names = await nameMap(rows.map((r) => r.member_id));
    body.innerHTML = `
      ${joined ? `<form id="com-gpost" class="com-form glass">
        <textarea name="body" rows="3" required placeholder="${esc(t("grp.postPh"))}"></textarea>
        <div><button class="btn btn-primary" type="submit">${esc(t("grp.postBtn"))}</button></div>
      </form>` : `<p class="com-note muted">${esc(t(me ? "grp.notMember" : "com.login"))}</p>`}
      ${rows.length
        ? rows
            .map(
              (p) => `<div class="com-answer glass">
                <p class="com-body">${esc(p.body)}</p>
                <div class="com-a-foot">
                  <span class="muted">${esc(who(names, p.member_id))} · ${esc(when(p.created_at))}</span>
                  ${(isOwner || p.member_id === me) ? `<button type="button" class="btn btn-sm btn-danger" data-pdel="${p.id}">🗑</button>` : ""}
                </div>
              </div>`
            )
            .join("")
        : `<p class="com-empty muted">${esc(t("grp.noPosts"))}</p>`}`;
    const f = body.querySelector("#com-gpost");
    if (f)
      f.onsubmit = async (e) => {
        e.preventDefault();
        // posting is members-only and the check happens now, at execution time
        const chk = await req(`/rest/v1/community_group_members?group_id=eq.${g.id}&member_id=eq.${encodeURIComponent(me)}&select=role`);
        if (!(chk.ok && Array.isArray(chk.data) && chk.data.length)) return toast(t("grp.notMember"));
        const txt = String(new FormData(f).get("body") || "").trim();
        if (!txt) return;
        const row = await insertRow("/rest/v1/community_group_posts", { group_id: g.id, member_id: me, body: txt });
        if (row) drawGroupPosts(body, g, joined, isOwner, me);
      };
    body.querySelectorAll("[data-pdel]").forEach((b) => {
      b.onclick = async () => {
        const pid = Number(b.dataset.pdel);
        // author or group owner — read the post from the row, then delete
        const pr = await req(`/rest/v1/community_group_posts?id=eq.${pid}&select=member_id`);
        const owner = pr.ok && Array.isArray(pr.data) && pr.data[0] ? pr.data[0].member_id : "";
        if (owner !== me && g.owner_id !== me) return toast(t("grp.notOwner"));
        const r = await req(`/rest/v1/community_group_posts?id=eq.${pid}`, { method: "DELETE" });
        if (!r.ok) return toast(t("grp.saveFail"));
        drawGroupPosts(body, g, joined, isOwner, me);
      };
    });
  }

  function groupViewEdit(box, id) {
    req(`/rest/v1/community_groups?id=eq.${id}&select=*`).then((res) => {
      const g = res.ok && Array.isArray(res.data) ? res.data[0] : null;
      if (!g) return toast(t("grp.loadFail"));
      box.innerHTML = `<a class="com-back" href="${gLink(id)}">← ${esc(g.name)}</a>`;
      groupForm(box, g);
    });
  }

  // ─────────────────────────── hub shell ───────────────────────────
  function paint(root) {
    const route = hashRoute();
    // Legacy content routes keep the Articles / Q&A tab bar; the hub's default
    // face is the Groups (Discover / My Groups / Create).
    const legacy = ["question", "article", "ask", "newArticle", "list"].includes(route.view);
    let inner;
    if (["question", "article", "ask", "newArticle", "group", "newGroup"].includes(route.view)) inner = `<div id="com-body"></div>`;
    else if (legacy)
      inner = `<div class="com-tabs" role="tablist">
          <button type="button" role="tab" class="follow-tab${route.tab === "questions" ? " active" : ""}" data-tab="questions">${esc(t("com.tab.questions"))}</button>
          <button type="button" role="tab" class="follow-tab${route.tab === "articles" ? " active" : ""}" data-tab="articles">${esc(t("com.tab.articles"))}</button>
        </div>
        <div id="com-acts">
          ${route.tab === "questions" ? `<a class="btn btn-sm btn-primary" href="#ask">❓ ${esc(t("com.ask"))}</a>` : `<a class="btn btn-sm btn-primary" href="#new-article">✍ ${esc(t("com.newArticle"))}</a>`}
        </div>
        <div id="com-body"><p class="com-note muted">${esc(t("common.loading"))}</p></div>`;
    else
      inner = `<div class="com-tabs" role="tablist">
          <button type="button" role="tab" class="follow-tab${route.tab === "discover" ? " active" : ""}" data-gtab="discover">🔍 ${esc(t("grp.discover"))}</button>
          <button type="button" role="tab" class="follow-tab${route.tab === "my" ? " active" : ""}" data-gtab="my">👥 ${esc(t("grp.my"))}</button>
        </div>
        <div id="com-acts">${meId() ? `<a class="btn btn-sm btn-primary" href="#new-group">➕ ${esc(t("grp.create"))}</a>` : loginNote()}</div>
        <div id="com-body"><p class="com-note muted">${esc(t("common.loading"))}</p></div>`;
    const head = legacy
      ? `<p class="eyebrow">${esc(t("com.eyebrow"))}</p><h1>${esc(t("com.title"))}</h1><p class="com-lead muted">${esc(t("com.lead"))}</p>`
      : `<p class="eyebrow">${esc(t("com.eyebrow"))}</p><h1>${esc(t("grp.title"))}</h1><p class="com-lead muted">${esc(t("grp.lead"))}</p>`;
    root.innerHTML = head + inner;
    const body = root.querySelector("#com-body");
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => (location.hash = b.dataset.tab === "articles" ? "#articles" : "#questions")));
    root.querySelectorAll("[data-gtab]").forEach((b) => (b.onclick = () => (location.hash = b.dataset.gtab === "my" ? "#my-groups" : "#")));
    if (route.view === "question") return questionView(body, route.id);
    if (route.view === "article") return articleView(body, route.id);
    if (route.view === "ask") return askForm(body);
    if (route.view === "newArticle") return articleForm(body);
    if (route.view === "group") return groupView(body, route.id);
    if (route.view === "newGroup") return groupForm(body);
    if (route.view === "groups") return listGroups(body, route.tab === "my");
    return route.tab === "articles" ? listArticles(body) : listQuestions(body);
  }

  function viewCommunity(root) {
    paint(root);
  }

  // Profile > Community: the visited member's contributions (articles, their
  // questions, their answers), every row linking back into the hub.
  async function fetchContribs(memberId) {
    const [q, a, arts] = await Promise.all([
      req(`/rest/v1/community_questions?member_id=eq.${encodeURIComponent(memberId)}&select=*&order=created_at.desc&limit=100`),
      req(`/rest/v1/community_answers?member_id=eq.${encodeURIComponent(memberId)}&select=*&order=created_at.desc&limit=100`),
      req(`/rest/v1/community_articles?member_id=eq.${encodeURIComponent(memberId)}&select=*&order=created_at.desc&limit=100`),
    ]);
    const qs = q.ok && Array.isArray(q.data) ? q.data : [];
    const ans = a.ok && Array.isArray(a.data) ? a.data : [];
    const ats = arts.ok && Array.isArray(arts.data) ? arts.data : [];
    const failed = !q.ok || !a.ok || !arts.ok;
    const qTitles = new Map();
    if (ans.length) {
      const ids = [...new Set(ans.map((x) => x.question_id))];
      const qr = await req(`/rest/v1/community_questions?id=in.(${idsIn(ids)})&select=id,title`);
      if (qr.ok && Array.isArray(qr.data)) qr.data.forEach((x) => qTitles.set(x.id, x.title));
    }
    return { qs, ans, ats, failed, qTitles };
  }

  const rowQ = (x) => `<a class="com-row-mini" href="${dLink("question", x.id)}">❓ ${esc(x.title)} <span class="muted">${esc(when(x.created_at))} · 💬 ${x.answers_count || 0}</span></a>`;
  const rowA = (x, qTitles) => `<a class="com-row-mini" href="${dLink("answer", x.id)}">↩ ${esc(String(x.body || "").slice(0, 90))} <span class="muted">${esc(qTitles.get(x.question_id) || "")} · 👍 ${x.votes || 0}</span></a>`;
  const rowArt = (x) => `<a class="com-row-mini" href="${dLink("article", x.id)}">✍ ${esc(x.title)} <span class="muted">${esc(when(x.created_at))} · 👁 ${x.views || 0}</span></a>`;
  const block = (title, rows, draw, emptyKey) =>
    `<section class="com-block"><h3>${title} <span class="muted">${rows.length}</span></h3>${rows.length ? rows.map(draw).join("") : `<p class="muted">${esc(t(emptyKey))}</p>`}</section>`;
  const KINDS = {
    articles: (d) => block(esc(t("com.tab.articles")), d.ats, rowArt, "com.noneArts"),
    questions: (d) => block(esc(t("com.tab.questions")), d.qs, rowQ, "com.noneQ"),
    answers: (d) => block("↩ " + esc(t("com.answersN")), d.ans, (x) => rowA(x, d.qTitles), "com.noneA"),
  };

  // One (or all) contribution blocks of a member — used standalone by memberView
  // and inside Profile > Your content by its type filter (js/profile.js).
  async function memberBlocks(box, memberId, kind) {
    const d = await fetchContribs(memberId);
    const draw = kind && KINDS[kind] ? [KINDS[kind]] : [KINDS.articles, KINDS.questions, KINDS.answers];
    box.innerHTML =
      (d.failed ? `<p class="com-note">⚠ ${esc(t("com.loadFail"))}</p>` : "") + draw.map((fn) => fn(d)).join("");
  }

  // Profile > Community-style view: the visited member's contributions with the
  // creation shortcuts and the link back to the hub.
  async function memberView(main, memberId) {
    main.innerHTML = `<p class="eyebrow">${esc(t("com.eyebrow"))}</p><h1>${esc(t("com.title"))}</h1>
      <div class="com-acts"><a class="btn btn-sm btn-primary" href="./community.html#ask">❓ ${esc(t("com.ask"))}</a>
      <a class="btn btn-sm btn-primary" href="./community.html#new-article">✍ ${esc(t("com.newArticle"))}</a>
      <a class="btn btn-sm btn-ghost" href="./community.html">🌐 ${esc(t("com.openHub"))}</a></div>
      <div id="com-mb"><p class="com-note muted">${esc(t("common.loading"))}</p></div>`;
    await memberBlocks(main.querySelector("#com-mb"), memberId);
    if (window.CineAura && window.CineAura.hydrateAvatars) window.CineAura.hydrateAvatars(main);
  }

  // Profile > Community section: the groups this member created or joined. The
  // hub keeps discovery and the group pages themselves — this is only the
  // member's own corner of them. Rendered with neutral markup so it looks right
  // on the profile (which does not load community.css).
  async function memberGroups(box, memberId) {
    const id = encodeURIComponent(memberId);
    const [own, joined] = await Promise.all([
      req(`/rest/v1/community_groups?owner_id=eq.${id}&select=*&order=created_at.desc&limit=60`),
      req(`/rest/v1/community_group_members?member_id=eq.${id}&select=group_id,community_groups(*)&limit=60`),
    ]);
    if (!own.ok && !joined.ok)
      return (box.innerHTML = `<p class="empty">⚠ ${esc(t("grp.loadFail"))}</p>`);
    const seen = new Set();
    const rows = [];
    const push = (g) => {
      if (g && g.id != null && !seen.has(g.id)) {
        seen.add(g.id);
        rows.push(g);
      }
    };
    (Array.isArray(own.data) ? own.data : []).forEach(push);
    (Array.isArray(joined.data) ? joined.data : []).forEach((r) => push(r.community_groups));
    if (!rows.length) return (box.innerHTML = `<p class="empty">${esc(t("prof.grp.none"))}</p>`);
    const names = await nameMap(rows.map((g) => g.owner_id));
    box.innerHTML = rows
      .map(
        (g) => `<a class="glass pf-grp-row" href="${gLink(g.id)}">
          ${g.cover ? `<img class="pf-grp-cover" src="${esc(g.cover)}" alt="" loading="lazy" />` : `<span class="pf-grp-ph">👥</span>`}
          <span class="pf-grp-main"><strong>${esc(g.name)}</strong>
          <span class="muted">${esc(String(g.description || "").slice(0, 90))}</span>
          <span class="muted">${esc(t("grp.byOwner", { name: who(names, g.owner_id) }))}</span></span>
          <span class="chip">👥 ${g.members_count || 0} ${esc(t("grp.members"))}</span>
        </a>`
      )
      .join("");
  }

  // One composer entry for pages that are not the hub (Create > Studio draws the
  // same forms instead of linking away, so there is exactly one implementation).
  function openComposer(box, kind) {
    return kind === "article" ? articleForm(box) : askForm(box);
  }

  // ── The content pages (round 39) ───────────────────────────────────────────
  // content.html is the home that gathers the members' work; each type has its
  // own page and one id on it:
  //   articles.html?id=ID   one article   (no id: the articles list)
  //   answers.html?id=ID    one question or one answer (no id: the questions list)
  //   documents.html?id=ID  one document  (no id: the documents library)
  // video.html is the videos' own page and keeps its own code (js/content.js).
  const PAGE_TITLES = { articles: "com.tab.articles", questions: "com.tab.questions" };

  // One row of the home page: the newest articles or the newest questions, the
  // same rows the lists draw, so both always look and link the same way.
  async function homeRows(box, kind, limit) {
    const table = kind === "questions" ? "community_questions" : "community_articles";
    const res = await req(`/rest/v1/${table}?select=*&order=created_at.desc&limit=${Math.max(1, Number(limit) || 4)}`);
    const rows = res.ok && Array.isArray(res.data) ? res.data : [];
    if (!res.ok) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))}</p>`);
    if (!rows.length) return (box.innerHTML = `<p class="com-empty muted">${esc(t(kind === "questions" ? "com.emptyQ" : "com.emptyA"))}</p>`);
    const names = await nameMap(rows.map((r) => r.member_id));
    box.innerHTML = rows
      .map((r) =>
        kind === "questions"
          ? `<a class="com-row glass" href="${dLink("question", r.id)}">
          <span class="com-row-main"><strong>${esc(r.title)}</strong>
          <span class="muted">${esc(who(names, r.member_id))} · ${esc(when(r.created_at))}</span></span>
          <span class="com-chip">💬 ${r.answers_count || 0} ${esc(t("com.answersN"))}</span>
        </a>`
          : `<a class="com-row glass" href="${dLink("article", r.id)}">
          <span class="com-row-main"><strong>${esc(r.title)}</strong>
          <span class="muted">${esc(who(names, r.member_id))} · ${esc(when(r.created_at))}${r.tags ? ` · ${esc(r.tags)}` : ""}</span></span>
          <span class="com-chip">👁 ${r.views || 0}</span>
        </a>`
      )
      .join("");
  }

  // The head of one type page: its name, what it holds, and the one action that
  // adds to it (the hub's own composers — no second form here).
  function pageHead(kind) {
    const isQ = kind === "questions";
    return `<div class="pg-head">
        <span class="eyebrow">${esc(t("ct.eyebrow"))}</span>
        <h1>${esc(t(PAGE_TITLES[kind]))}</h1>
        <p class="muted">${esc(t(isQ ? "ct.leadQuestions" : "ct.leadArticles"))}</p>
        <div class="pg-acts">
          ${isQ
            ? `<a class="btn btn-sm btn-primary" href="./community.html#ask">❓ ${esc(t("com.ask"))}</a>`
            : `<a class="btn btn-sm btn-primary" href="./article-Editor.html">✍ ${esc(t("com.newArticle"))}</a>`}
          <a class="btn btn-sm btn-ghost" href="./community.html#${isQ ? "questions" : "articles"}">${esc(t("ct.hub"))}</a>
        </div>
      </div>`;
  }

  // content.html?article=ID and friends still arrive on a type page (see
  // CineAura.routeAliases); this reads the id either way.
  function pageId(params) {
    return String(params.get("id") || "").trim();
  }

  async function bootPage(root, kind) {
    if (!root) return false;
    const params = new URLSearchParams(location.search);
    const id = pageId(params);
    if (id) {
      if (!/^\d+$/.test(id)) {
        root.innerHTML = `<p class="com-note">⚠ ${esc(t("ct.invalid"))} <a class="btn btn-sm btn-primary" href="./${kind === "questions" ? "answers" : "articles"}.html">${esc(t("ct.library"))}</a></p>`;
        return true;
      }
      root.innerHTML = `<p class="com-note muted">${esc(t("common.loading"))}</p>`;
      if (kind === "documents") {
        const draw = () => {
          if (window.CineAuraDocs) window.CineAuraDocs.documentView(root, id);
          else root.innerHTML = `<p class="com-note">⚠ ${esc(t("doc.loadFail"))}</p>`;
        };
        if (window.CineAuraDocs) draw();
        else setTimeout(draw, 120);
      } else if (kind === "questions") {
        // ?kind=answer picks one answer; a bare id is a question
        if (String(params.get("kind") || "").toLowerCase() === "answer") answerView(root, Number(id));
        else questionView(root, Number(id));
      } else {
        articleView(root, Number(id));
      }
      return true;
    }
    if (kind === "documents") {
      root.innerHTML = `<div class="pg-head">
          <span class="eyebrow">${esc(t("ct.eyebrow"))}</span>
          <h1>${esc(t("doc.tab"))}</h1>
          <p class="muted">${esc(t("ct.leadDocuments"))}</p>
          <div class="pg-acts"><a class="btn btn-sm btn-primary" href="./profile.html?section=create">${esc(t("vid.hub.create"))}</a></div>
        </div><div id="pg-docs"><p class="com-note muted">${esc(t("common.loading"))}</p></div>`;
      const box = root.querySelector("#pg-docs");
      if (window.CineAuraDocs) window.CineAuraDocs.list(box);
      else box.innerHTML = `<p class="com-note">⚠ ${esc(t("doc.loadFail"))}</p>`;
      return false;
    }
    root.innerHTML = `${pageHead(kind)}<div id="pg-list"><p class="com-note muted">${esc(t("common.loading"))}</p></div>`;
    const box = root.querySelector("#pg-list");
    if (kind === "questions") listQuestions(box);
    else listArticles(box);
    return false;
  }

  window.CineAuraCommunity = { viewCommunity, memberView, memberBlocks, memberGroups, openComposer, bootPage, homeRows };

  window.addEventListener("hashchange", () => {
    const root = document.getElementById("com-root");
    if (root) paint(root);
  });
  // ?group= lives in the query string, so back/forward between a group and the
  // list travels through popstate, not hashchange.
  window.addEventListener("popstate", () => {
    const root = document.getElementById("com-root");
    if (root) paint(root);
  });
  // Auto-boot only where this file owns the page: the hub (#com-root) and the
  // type pages (#page-root). The profile embeds it for memberView only.
  const boot = () => {
    const root = document.getElementById("com-root");
    if (root) paint(root);
    const page = document.getElementById("page-root");
    if (page) bootPage(page, String(page.dataset.kind || "articles"));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
