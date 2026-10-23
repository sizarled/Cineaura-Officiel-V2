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
  // when the same renderer is embedded on another page (Content tabs, the profile).
  const base = () => (document.getElementById("com-root") ? "" : "./community.html");
  const loginNote = () =>
    meId() ? "" : `<p class="com-note muted">${esc(t("com.login"))} <a class="btn btn-sm btn-primary" href="./login.html">${esc(t("nav.signin"))}</a></p>`;

  const hashRoute = () => {
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
        (q) => `<a class="com-row glass" href="${base()}#q/${q.id}">
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

  async function questionView(box, id) {
    const res = await req(`/rest/v1/community_questions?id=eq.${id}&select=*`);
    const q = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    if (!q) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))} <a href="#">${esc(t("com.backList"))}</a></p>`);
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
    box.innerHTML = `<a class="com-back" href="#">← ${esc(t("com.backList"))}</a>
      <article class="com-q glass">
        <h2>${esc(q.title)}</h2>
        <p class="muted">${esc(who(names, q.member_id))} · ${esc(when(q.created_at))}</p>
        ${q.details ? `<p class="com-body">${esc(q.details)}</p>` : ""}
      </article>
      <h3 class="com-h3">💬 ${answers.length} ${esc(t("com.answersN"))}</h3>
      <div id="com-answers">${answers
        .map(
          (a) => `<div class="com-answer glass">
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
        (a) => `<a class="com-row glass" href="${base()}#a/${a.id}">
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

  async function articleView(box, id) {
    const res = await req(`/rest/v1/community_articles?id=eq.${id}&select=*`);
    const a = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    if (!a) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("com.loadFail"))} <a href="#articles">${esc(t("com.backList"))}</a></p>`);
    const names = await nameMap([a.member_id]);
    // best-effort view counter (fire and forget, like the help center readers)
    req(`/rest/v1/community_articles?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ views: Number(a.views || 0) + 1 }),
    }).catch(() => {});
    box.innerHTML = `<a class="com-back" href="#articles">← ${esc(t("com.backList"))}</a>
      <article class="com-article glass">
        <h2>${esc(a.title)}</h2>
        <p class="muted">${esc(who(names, a.member_id))} · ${esc(when(a.created_at))}${a.tags ? ` · ${esc(a.tags)}` : ""} · 👁 ${(a.views || 0) + 1}</p>
        <p class="com-body">${esc(a.body)}</p>
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
        (g) => `<a class="com-row glass" href="#g/${g.id}">
          ${g.cover ? `<img class="com-grp-cover" src="${esc(g.cover)}" alt="" loading="lazy" />` : `<span class="com-grp-cover com-grp-ph">👥</span>`}
          <span class="com-row-main"><strong>${esc(g.name)}</strong>
          <span class="muted">${esc(String(g.description || "").slice(0, 90))}</span>
          <span class="muted">${esc(t("grp.byOwner", { name: who(names, g.owner_id) }))}</span></span>
          <span class="com-chip">👥 ${g.members_count || 0} ${esc(t("grp.members"))}</span>
        </a>`
      )
      .join("");
  }

  function groupForm(box) {
    if (!meId()) return (box.innerHTML = loginNote());
    box.innerHTML = `<form id="com-grp" class="com-form glass">
      <input name="name" maxlength="120" required placeholder="${esc(t("grp.namePh"))}" />
      <textarea name="description" rows="3" placeholder="${esc(t("grp.descPh"))}"></textarea>
      <textarea name="rules" rows="3" placeholder="${esc(t("grp.rulesPh"))}"></textarea>
      <input name="cover" maxlength="300" placeholder="${esc(t("grp.coverPh"))}" />
      <label class="lang-chip"><input type="checkbox" name="is_public" checked /> ${esc(t("grp.public"))}</label>
      <div><button class="btn btn-primary" type="submit">${esc(t("grp.createBtn"))}</button>
      <button class="btn btn-ghost" type="button" onclick="location.hash=''">${esc(t("common.cancel"))}</button></div>
    </form>`;
    box.querySelector("#com-grp").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = await insertRow("/rest/v1/community_groups", {
        owner_id: meId(),
        name: String(fd.get("name") || "").trim(),
        description: String(fd.get("description") || "").trim(),
        rules: String(fd.get("rules") || "").trim(),
        cover: String(fd.get("cover") || "").trim(),
        is_public: fd.get("is_public") === "on",
      });
      if (!row) return;
      // seat the owner (so the member count and My Groups include it) then open the group
      req("/rest/v1/community_group_members?select=group_id,member_id", {
        method: "POST",
        body: JSON.stringify({ group_id: row.id, member_id: meId(), role: "owner" }),
      })
        .catch(() => {})
        .finally(() => {
          toast(t("grp.saved"));
          location.hash = `#g/${row.id}`;
        });
    };
  }

  async function groupView(box, id) {
    const res = await req(`/rest/v1/community_groups?id=eq.${id}&select=*`);
    const g = res.ok && Array.isArray(res.data) ? res.data[0] : null;
    if (!g) return (box.innerHTML = `<p class="com-note">⚠ ${esc(t("grp.loadFail"))} <a href="#">${esc(t("com.backList"))}</a></p>`);
    const names = await nameMap([g.owner_id]);
    const me = meId();
    let joined = false;
    if (me) {
      const mr = await req(`/rest/v1/community_group_members?group_id=eq.${id}&member_id=eq.${encodeURIComponent(me)}&select=role`);
      joined = mr.ok && Array.isArray(mr.data) && !!mr.data.length;
    }
    box.innerHTML = `<a class="com-back" href="#">← ${esc(t("com.backList"))}</a>
      <article class="com-q com-grp glass">
        ${g.cover ? `<img class="com-grp-hero" src="${esc(g.cover)}" alt="" loading="lazy" />` : ""}
        <h2>${esc(g.name)} ${g.is_public ? "" : "🔒"}</h2>
        <p class="muted">${esc(t("grp.byOwner", { name: who(names, g.owner_id) }))} · 👥 ${g.members_count || 0} ${esc(t("grp.members"))}</p>
        ${g.description ? `<p class="com-body">${esc(g.description)}</p>` : ""}
        ${g.rules ? `<h3 class="com-h3">${esc(t("grp.rulesTitle"))}</h3><p class="com-body">${esc(g.rules)}</p>` : ""}
        <div class="com-acts" style="margin-top:12px">
          ${me ? `<button type="button" class="btn btn-sm ${joined ? "btn-ghost" : "btn-primary"}" id="com-join">${joined ? esc(t("grp.leave")) : esc(t("grp.join"))}</button>` : loginNote()}
        </div>
      </article>`;
    const jb = box.querySelector("#com-join");
    if (jb)
      jb.onclick = async () => {
        jb.disabled = true;
        const r = await req(
          joined
            ? `/rest/v1/community_group_members?group_id=eq.${id}&member_id=eq.${encodeURIComponent(meId())}`
            : `/rest/v1/community_group_members?select=group_id,member_id`,
          joined
            ? { method: "DELETE" }
            : { method: "POST", body: JSON.stringify({ group_id: id, member_id: meId() }) }
        );
        if (!r.ok) toast(t("grp.saveFail"));
        groupView(box, id);
      };
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

  const rowQ = (x) => `<a class="com-row-mini" href="./community.html#q/${x.id}">❓ ${esc(x.title)} <span class="muted">${esc(when(x.created_at))} · 💬 ${x.answers_count || 0}</span></a>`;
  const rowA = (x, qTitles) => `<a class="com-row-mini" href="./community.html#q/${x.question_id}">↩ ${esc(String(x.body || "").slice(0, 90))} <span class="muted">${esc(qTitles.get(x.question_id) || "")} · 👍 ${x.votes || 0}</span></a>`;
  const rowArt = (x) => `<a class="com-row-mini" href="./community.html#a/${x.id}">✍ ${esc(x.title)} <span class="muted">${esc(when(x.created_at))} · 👁 ${x.views || 0}</span></a>`;
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

  window.CineAuraCommunity = { viewCommunity, memberView, memberBlocks };

  // Content page (content.html): a type bar above the videos — Videos stay with
  // their own page code; Articles / Questions & Answers embed the hub lists.
  function wireContentTabs() {
    const root = document.getElementById("vw-root");
    if (!root || document.getElementById("ct-tabs")) return;
    const originals = [...root.children];
    const tabs = document.createElement("div");
    tabs.id = "ct-tabs";
    tabs.className = "com-tabs ct-tabs";
    tabs.setAttribute("role", "tablist");
    const other = document.createElement("div");
    other.id = "ct-other";
    other.hidden = true;
    root.prepend(other);
    root.prepend(tabs);
    const TABS = [
      ["videos", t("nav.videos")],
      ["articles", t("com.tab.articles")],
      ["questions", t("com.tab.questions")],
    ];
    tabs.innerHTML = TABS.map(([k, label], i) => `<button type="button" role="tab" class="follow-tab${i === 0 ? " active" : ""}" data-ct="${k}">${esc(label)}</button>`).join("");
    tabs.querySelectorAll("[data-ct]").forEach((b) => {
      b.onclick = () => {
        tabs.querySelectorAll("[data-ct]").forEach((x) => x.classList.toggle("active", x === b));
        const k = b.dataset.ct;
        if (k === "videos") {
          originals.forEach((el) => (el.hidden = false));
          other.hidden = true;
          return;
        }
        originals.forEach((el) => (el.hidden = true));
        other.hidden = false;
        other.innerHTML = `<div id="com-acts" style="margin-bottom:10px">${
          k === "questions"
            ? `<a class="btn btn-sm btn-primary" href="./community.html#ask">❓ ${esc(t("com.ask"))}</a>`
            : `<a class="btn btn-sm btn-primary" href="./community.html#new-article">✍ ${esc(t("com.newArticle"))}</a>`
        }</div><div id="ct-body"><p class="com-note muted">${esc(t("common.loading"))}</p></div>`;
        (k === "questions" ? listQuestions : listArticles)(other.querySelector("#ct-body"));
      };
    });
  }

  window.addEventListener("hashchange", () => {
    const root = document.getElementById("com-root");
    if (root) paint(root);
  });
  // Auto-boot only on the hub page itself (the profile embeds this file for
  // memberView only — no #com-root there, nothing to paint).
  const boot = () => {
    const root = document.getElementById("com-root");
    if (root) paint(root);
    wireContentTabs();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
