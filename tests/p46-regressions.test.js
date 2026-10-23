// Regression spot-checks for Tasks 43.A / 44 / 45.  node tests/p46-regressions.test.js
const { read, make, fs, path, ROOT } = require("./lib/harness");
const { ok, has, done } = make();

// ---------------- Task 45: default-theme performance pass
const th = read("css/themes.css");
has("p45: perf block header", th, "PERFORMANCE PASS");
has("p45: grain hidden", th, ".grain { display: none; }");
has("p45: orb de-blurred", th, ".orb {\n  filter: none;\n  opacity: 0.55;");
has("p45: orb slowed", th, "animation-duration: 45s;");
has("p45: orb composited", th, "will-change: transform;");
ok("p45: two closest-side gradients", th.split("radial-gradient(closest-side").length - 1 === 2);
has("p45: cyan pool", th, "rgba(1, 180, 228, 0.5)");
has("p45: green pool", th, "rgba(144, 206, 161, 0.45)");
has("p45: chrome keeps small blur", th, "blur(6px) saturate(135%)");
has("p45: glass list", th, ".glass,") && has("p45: backdrop off", th, "backdrop-filter: none;");
has("p45: night surface denser", th, "rgba(12, 28, 45, 0.9)");
has("p45: day surface denser", th, "rgba(255, 255, 255, 0.9)");
has("p45: hero filter off", th, ".hero-bg { filter: none; }");
has("p45: decorative slowed to 60s", th, "60s");
const block = th.slice(th.indexOf("PERFORMANCE PASS"));
const bad = block.split("\n").filter((l) => {
  const t = l.trim();
  if (!t || t.startsWith("/*") || t.startsWith("*") || t.endsWith("*/")) return false;
  if (!t.includes("{")) return false;
  if (t.startsWith("@")) return false;
  return !t.startsWith('html[data-style="default"]');
});
ok(`p45: all new selectors default-scoped (${bad.length} offenders)`, bad.length === 0);
ok("p45: brace balance", (th.match(/{/g) || []).length === (th.match(/}/g) || []).length);

// ---------------- Task 44: article editor + uploads + reports
ok("p44: sql/help_upload.sql exists", fs.existsSync(path.join(ROOT, "sql/help_upload.sql")));
ok("p44: help_upload non-trivial", read("sql/help_upload.sql").length > 800);
const pr = read("sql/post_reports.sql");
has("p44: post_reports table", pr, "create table if not exists public.post_reports");
has("p44: verdict check", pr, "constraint post_reports_verdict_check check (verdict in ('valid', 'ended'))");
has("p44: reported_at", pr, "reported_at timestamptz not null default now()");
ok("p44: js/help-article.js exists", fs.existsSync(path.join(ROOT, "js/help-article.js")));
has("p44: Article.html loads the editor", read("Article.html"), "help-article.js");

// ---------------- Help v2 bridge (live v1->v2 repair, 2026-10-22)
const hs = read("sql/help.sql");
has("bridge: categories table", hs, "create table if not exists public.help_categories");
has("bridge: articles v2 columns added", hs, "alter table public.help_articles add column if not exists slug text");
has("bridge: uuid article ids", hs, "article_id uuid not null references public.help_articles(id) on delete cascade");
has("bridge: uuid join table", hs, "create table if not exists public.help_article_categories");
has("bridge: votes legacy cols unblocked", hs, "alter table public.help_article_votes alter column voter_key drop not null;");
has("bridge: votes legacy cols unblocked 2", hs, "alter table public.help_article_votes alter column is_useful drop not null;");
has("bridge: uuid vote rpc", hs, "public.help_vote(p_article uuid, p_member text, p_helpful boolean)");
has("bridge: uuid view rpc", hs, "public.help_increment_view(p_id uuid)");
has("bridge: identity-guarded default", hs, "attidentity");
has("bridge: category seed", hs, "'getting-started'");
has("bridge: editor category gate intact", read("js/help-article.js"), '#ed-cats input[name="cats"]:checked');

// ---------------- Help Center categories tab (helpcats merged into Help, 2026-10-22)
ok("helpcats: module exists", fs.existsSync(path.join(ROOT, "js/help-cats.js")));
const pj = read("js/panel.js");
has("helpcats: ALL_SECTIONS back to help-only", pj, '"help", "staff", "platforms", "settings"');
has("helpcats: nav group back to help-only", pj, '"reports", "announce", "help", "plans", "platforms"');
has("helpcats: legacy deep link remapped", pj, 'requestedSection === "helpcats"');
has("helpcats: initial tab passed to viewHelp", pj, "viewHelp(m, helpInitialTab)");
const hp = read("js/help-panel.js");
has("helpcats: cats tab inside Help Center", hp, 'data-htab="cats"');
has("helpcats: articles tab inside Help Center", hp, 'data-htab="articles"');
has("helpcats: tab delegates to module", hp, "window.CineAuraHelpCats.viewHelpCats(body)");
has("helpcats: initialTab support", hp, "initialTab === 'cats'");
has("helpcats: panel.html loads module", read("panel.html"), 'src="js/help-cats.js"');
ok("helpcats: standalone nav icon removed", !read("js/common.js").includes("helpcats:"));
const hc = read("js/help-cats.js");
has("helpcats: REST fetch", hc, '/rest/v1/help_categories?select=*');
has("helpcats: delete section", hc, "method: 'DELETE'");
has("helpcats: inline error surface", hc, 'helpcats.loadFail');
has("helpcats: editor retry button", read("js/help-article.js"), 'id="ed-cats-retry"');
has("helpcats: editor records load error", read("js/help-article.js"), 'lastCatsErr');
has("helpcats: engine nav label kept as tab label", read("js/i18n.js"), '"panel.nav.helpcats": "Categories"');
has("helpcats: engine addMain", read("js/i18n.js"), '"helpcats.addMain": "Add section"');
has("helpcats: engine articles-tab label", read("js/i18n.js"), '"help.tabArticles": "Articles"');

// ---------------- Profile sidebar: Profile label + member order (2026-10-22)
has("profile nav: order, Your content unified", read("js/profile.js"), 'NAV_SECTIONS = ["home", "market", "community", "create", "content", "posts", "messages", "search", "following", "blocked", "settings"]');
has("profile nav: Home renamed to Profile", read("js/i18n.js"), '"prof.home": "Profile"');

// ---------------- Dashboard sidebar journey groups (2026-10-22)
const dj = read("js/dashboard.js");
has("dashboard nav: Main group first", dj, '["dash.grp.main", ["overview", "level", "points"]]');
has("dashboard nav: content tools group (management lives in Studio)", dj, '["dash.grp.content", ["upload", "links", "codes", "playlists", "iptv"]]');
has("dashboard nav: views->analytics->reports->history", dj, '["dash.grp.perf", ["views", "analytics", "reports", "history"]]');
has("dashboard nav: earnings group", dj, '["dash.grp.earn", ["withdraw", "prizes"]]');
has("dashboard settings: profile-pointer note", dj, 'dash.settings.profNote');
has("dashboard settings: links profile settings deep", dj, './profile.html?section=settings');
has("dashboard nav: account group last", dj, '["dash.grp.account", ["settings"]]');
has("dashboard nav: SECTIONS derived from groups", dj, "SECTIONS = NAV_GROUPS.flatMap((g) => g[1])");
has("dashboard nav: group headings render", dj, '<p class="side-grp" role="presentation">');
has("dashboard nav: heading styling", read("css/dashboard.css"), ".side-nav .side-grp {");
has("dashboard nav: headings hidden in phone strip", read("css/mobile.css"), ".dash-side .side-nav .side-grp");
has("dashboard nav: engine group label", read("js/i18n.js"), '"dash.grp.main": "Main"');

// ---------------- Profile<->Dashboard cross-navigation + summaries (2026-10-22)
const pfv = read("js/profile.js");
has("profile: level chip links to dashboard level", pfv, 'href="./dashboard.html#level"');
has("profile: points chip links to dashboard points", pfv, 'href="./dashboard.html#points"');
has("profile: sidebar dashboard cross-link", pfv, 'class="prof-side-dash" href="./dashboard.html"');
has("profile: market links the delivery address", pfv, 'href="./dashboard.html#address"');
has("profile: cross-link styling", read("css/profile.css"), ".prof-side-dash {");
has("profile: address link label key", read("js/i18n.js"), '"mkt.addrLink": "Delivery address"');

// ---------------- Settings cross-notes + profile deep links (2026-10-22)
has("profile: ?section= deep link support", pfv, 'new URLSearchParams(location.search).get("section")');
has("profile settings: dashboard-pointer note", pfv, 'prof.settingsDashNote');
has("profile settings: links dashboard settings", pfv, './dashboard.html#settings');
has("i18n: profNote key", read("js/i18n.js"), '"dash.settings.profNote": "Privacy, follow policy');
has("i18n: dashNote key", read("js/i18n.js"), '"prof.settingsDashNote": "Appearance, account');

// ---------------- Community hub v1: Articles + Questions & Answers (2026-10-22)
const cs = read("sql/community.sql");
ok("community: sql exists", fs.existsSync(path.join(ROOT, "sql/community.sql")));
has("community: questions table", cs, "create table if not exists public.community_questions");
has("community: answers table", cs, "create table if not exists public.community_answers");
has("community: votes table", cs, "create table if not exists public.community_answer_votes");
has("community: articles table", cs, "create table if not exists public.community_articles");
has("community: answers counter trigger", cs, "_com_answers_count");
has("community: votes counter trigger", cs, "_com_answer_votes");
has("community: public read policies", cs, 'com_q_read      on public.community_questions    for select using (true)');
has("community: pgrst reload", cs, "notify pgrst, 'reload schema';");
const cj = read("js/community.js");
has("community: hub module", cj, "window.CineAuraCommunity = { viewCommunity, memberView, memberBlocks, memberGroups, openComposer };");
has("community: question route", cj, '#q/${row.id}');
has("community: deep-link router", cj, "const hashRoute = ()");
has("community: helpful vote toggle", cj, "community_answer_votes");
has("community: only boots on hub page", cj, 'if (root) paint(root);');
ok("community: page exists", fs.existsSync(path.join(ROOT, "community.html")));
has("community: page loads module", read("community.html"), 'src="js/community.js"');
has("community: page styling", fs.existsSync(path.join(ROOT, "css/community.css")) ? read("css/community.css") : "", ".com-tabs .follow-tab.active");
const pf2 = read("js/profile.js");
has("content hub: type filter tabs", pf2, 'CONTENT_TYPES = ["all", "videos", "articles", "documents", "questions", "answers", "posts", "reviews", "recs"]');
has("content hub: videos are a read-only shelf", pf2, "memberVideos(videos, hostId);");
has("content hub: community blocks by memberBlocks", pf2, "window.CineAuraCommunity.memberBlocks(community, hostId)");
has("content hub: engine tab all", read("js/i18n.js"), '"prof.ct.all": "All content"');
has("community: profile deep-link whitelist", pf2, '"home","market","community","create","content","posts","messages","search","following","blocked","settings"');
has("community: Create draws the Article composer inline", pf2, 'window.CineAuraCommunity.openComposer(host, kind)');
has("community: Create keeps Question in the studio kinds", pf2, 'const STUDIO_KINDS = ["video", "post", "document", "article", "question"');
has("community: profile.html loads module", read("profile.html"), 'src="js/community.js"');
has("community: header nav link", read("js/common.js"), '["./community.html", "nav.community"],');
has("community: nav icon key", read("js/common.js"), '"nav.community": "users"');
has("community: engine label", read("js/i18n.js"), '"nav.community": "Community"');
has("community: engine ask label", read("js/i18n.js"), '"com.ask": "Ask a question"');

// ---------------- Community = Groups; Content page mixes member content (2026-10-22)
const gs = read("sql/community_groups.sql");
ok("groups: sql exists", fs.existsSync(path.join(ROOT, "sql/community_groups.sql")));
has("groups: groups table", gs, "create table if not exists public.community_groups");
has("groups: members table", gs, "create table if not exists public.community_group_members");
has("groups: public flag", gs, "is_public     boolean not null default true");
has("groups: members counter trigger", gs, "_com_grp_members_count");
has("groups: public read policy", gs, 'com_grp_read   on public.community_groups        for select using (true)');
const cj2 = read("js/community.js");
has("groups: discover view", cj2, "async function listGroups(box, mine)");
has("groups: create form seats the owner", cj2, "role: \"owner\"");
has("groups: group page", cj2, "async function groupView(box, id)");
has("groups: join/leave toggle", cj2, "com-join");
has("groups: default face is groups", cj2, 'return { view: "groups", tab: "discover" };');
has("groups: legacy article/question routes kept", cj2, 'h.match(/^(q|a|g)\\/(\\d+)$/)');
has("groups: content page tabs wiring", cj2, "function wireContentTabs()");
has("groups: content.html loads community module", read("content.html"), 'src="js/community.js"');
has("groups: engine discover label", read("js/i18n.js"), '"grp.discover": "Discover Groups"');

// ---------------- Group page v2: ?group= routing + tabs + exec-time permission (2026-10-22)
const ps2 = read("sql/community_group_posts.sql");
ok("group posts: sql exists", fs.existsSync(path.join(ROOT, "sql/community_group_posts.sql")));
has("group posts: posts table", ps2, "create table if not exists public.community_group_posts");
has("group posts: reports table", ps2, "create table if not exists public.community_group_reports");
has("group posts: counter on groups", ps2, "add column if not exists posts_count");
has("group posts: posts trigger", ps2, "_com_grp_posts_count");
const cj3 = read("js/community.js");
has("group v2: query-param router", cj3, 'new URLSearchParams(location.search).get("group")');
has("group v2: legacy #g alias kept", cj3, 'h.match(/^(q|a|g)\\/(\\d+)$/)');
has("group v2: group tab switch", cj3, "const gTab = ()");
has("group v2: popstate repaints for ?group=", cj3, 'window.addEventListener("popstate", () => {');
has("group v2: posts tab", cj3, "async function drawGroupPosts(body, g, joined, isOwner, me)");
has("group v2: members tab", cj3, "async function drawGroupMembers(body, g, isOwner, me)");
has("group v2: about tab", cj3, "function drawGroupAbout(body, g)");
has("group v2: private gate at render", cj3, "if (!g.is_public && !joined)");
has("group v2: join re-checks membership at execution", cj3, "membership is re-checked from the row at execution time");
has("group v2: post is members-only at execution", cj3, "posting is members-only and the check happens now");
has("group v2: edit re-reads ownership at execution", cj3, "ownership is re-read from the row at execution time");
has("group v2: rows link with ?group=", cj3, 'href="${gLink(g.id)}"');
has("group v2: engine posts tab label", read("js/i18n.js"), '"grp.tab.posts": "Posts"');

// ---------------- Universal content deep links (Round 60 spec) ----------------
const cc = read("js/content.js");
has("deep: ?video= alias of idcontent", cc, 'params.get("idcontent") || params.get("video")');
const cj4 = read("js/community.js");
has("deep: dLink helper", cj4, "const dLink = (kind, id) =>");
has("deep: router reads one param per type", cj4, 'const routes = ["video", "article", "question", "answer", "document"];');
has("deep: invalid mixed route", cj4, "if (selected.length > 1) return invalid();");
has("deep: numeric id guard", cj4, "if (!id || !/^\\d+$/.test(id)) return invalid();");
has("deep: video left to content.js", cj4, 'if (selected[0] === "video") return false;');
has("deep: boot gives the router priority", cj4, "if (!contentDeepView()) wireContentTabs();");
has("deep: answer view with parent question", cj4, "questionView(box, a.question_id, a.id);");
has("deep: answer highlight anchor", cj4, 'data-ans="${a.id}"');

// ---------------- Create menu: one launcher for every content type (2026-10-23)
const pj3 = read("js/profile.js");
has("create: studio has three tabs", pj3, 'const STUDIO_TABS = ["create", "manage", "stats"];');
const kindsLine = pj3.slice(pj3.indexOf("const STUDIO_KINDS"), pj3.indexOf("const STUDIO_KINDS") + 200);
const crOrder = ["video", "post", "article", "question", "playlist", "recommendation", "reclist", "review"];
let crOk = crOrder.every((k, n) => kindsLine.indexOf(`"${k}"`) > (n === 0 ? -1 : kindsLine.indexOf(`"${crOrder[n - 1]}"`)));
ok("studio: kind order video > post > article > question > playlist > rec > reclist > review", crOk);
has("create: video form embedded solo (no nested tabs)", pj3, 'window.CineAuraStudio.render(host, { member: state.me.member, solo: true, tab: "create" });');
has("create: articles/questions reuse the hub composers", pj3, 'window.CineAuraCommunity.openComposer(host, kind)');
has("create: guidance note (answers from the question page)", pj3, "${t(\"prof.cr.note\")}");
{ const head = pj3.slice(pj3.indexOf("async function viewCreate"), pj3.indexOf("async function viewCreate") + 2600);
  ok("create: no standalone Answer or Group tab", !/data-ck="answer"/.test(head) && !/#new-group/.test(head)); }
const fe = read("js/i18n.js");
has("create: engine video key", fe, '"prof.cr.video": "Video"');

// ---------------- Profile/Dashboard for the new content types (2026-10-23) ----------------
const pfr = read("js/profile.js");
has("profile: Community section between Market and Create", pfr, 'NAV_SECTIONS = ["home", "market", "community", "create"');
has("profile: Community section view", pfr, "async function viewMemberGroups(main)");
has("profile: Community section opens the hub, not a copy", pfr, 'href="./community.html">🌐 ${escapeHtml(t("com.openHub"))}');
has("profile: Your content has 9 tabs", pfr, 'CONTENT_TYPES = ["all", "videos", "articles", "documents", "questions", "answers", "posts", "reviews", "recs"]');
has("profile: social tabs map to post kinds", pfr, 'POST_TYPES = { posts: ["post"], reviews: ["review"], recs: ["recommendation", "reclist"] }');
has("profile: social tabs render own rows only", pfr, "owner_id=eq.${restValue(memberId)}&select=*&order=created_at.desc&limit=80");
has("profile: real status chips are visibility-based", pfr, "escapeHtml(visLabel(p.visibility))");
const cjr = read("js/community.js");
has("community: memberGroups exported", cjr, "window.CineAuraCommunity = { viewCommunity, memberView, memberBlocks, memberGroups, openComposer };");
has("community: memberGroups covers created + joined", cjr, "community_groups?owner_id=eq.${id}");
has("community: memberGroups links groups by query id", cjr, 'href="${gLink(g.id)}"');
const djm = read("js/dashboard.js");
has("dashboard: content management left for the Studio", djm, '["dash.grp.content", ["upload", "links", "codes", "playlists", "iptv"]]');
has("studio: six management tabs", pj3, 'const MANAGE_TABS = ["videos", "documents", "articles", "qa", "posts", "recs"];');
has("studio: videos stay in Dashboard Upload", pj3, 'href="./dashboard.html#upload">${t("dash.nav.upload")}</a>');
has("studio: delete re-reads the row owner", pj3, "if (!row || String(row[ownerCol]) !== String(state.me.member.member_id)) return toast(t(\"manage.forbidden\"));");
has("studio: delete listener bound once", pj3, 'if (!main.dataset.mgBound)');

// ---------------- Create > Studio: create / manage / stats (2026-10-23) ----------
has("studio: content statistics tab counts real rows", pfr, 'const [vids, arts, qs, as, posts, mp] = await Promise.all([');
has("studio: stats reuse the points engine", pfr, "await window.CineAura.memberPoints(me, {})");
has("studio: stats cover views, likes, votes, comments, recs, points", pfr, '${tile(views, t("prof.stats.views"))}');
has("studio: Your content videos are view-only", pfr, 'href="./content.html?video=${encodeURIComponent(r.content_id)}"');
has("studio: posts hand off to Manage posts", pfr, '${t("manage.postsDeep")} <a class="btn btn-sm btn-ghost" href="?section=posts">');
has("studio: video studio embedded without its own URL hash", read("js/content-studio.js"), "if (!state.solo && location.hash !== hash)");
has("studio: hub composers shared, not copied", read("js/community.js"), "return kind === \"article\" ? articleForm(box) : askForm(box);");
has("studio: dashboard keeps no second manager", djm, '["dash.grp.content", ["upload", "links", "codes", "playlists", "iptv"]]');

// ---------------- Documents: the fifth content type (2026-10-23) -----------
const dcm = read("js/documents.js");
has("documents: module exported", dcm, "window.CineAuraDocs = { list, documentView, renderUpload, renderManage, memberDocuments");
has("documents: six format families", dcm, 'const FORMATS = [');
has("documents: extension allow-list covers office + archives", dcm, '["epub", "json", "xml", "md", "markdown"]');
has("documents: real bytes are sniffed, not just the name", dcm, "if (!agrees(ext, sig)) return C().toast(t(\"doc.fakeFile\", { ext }));");
has("documents: magic signatures (PDF / ZIP / OLE)", dcm, 'ascii(head, 0, 4) === "%PDF"');
has("documents: size and per-member caps", dcm, "const MAX_BYTES = 25 * 1024 * 1024;");
has("documents: private bucket, signed links only", dcm, 'const PRIVATE_BUCKET = "documents";');
has("documents: signed link expires", dcm, "const SIGN_SECONDS = 60;");
has("documents: pdf previews, nothing else executes", dcm, 'const CAN_PREVIEW = (kind) => Boolean((FORMATS.find((f) => f.kind === kind) || {}).preview);');
has("documents: private rows gated at read time", dcm, "if (!canSee(row, me))");
has("documents: delete re-reads the owner", dcm, "if (!row || row.member_id !== me) {");
has("documents: orphan file removed when the row fails", dcm, "await removeFile(path, bucket); // never leave an orphan file behind");
const cjd = read("js/community.js");
has("documents: content.html router accepts ?document=", cjd, 'const routes = ["video", "article", "question", "answer", "document"];');
has("documents: library tab added", cjd, '["documents", t("doc.tab")]');
has("documents: ?type=documents selects the tab", cjd, 'if (only === "documents") ui.ctTab = "documents";');
const pfd = read("js/profile.js");
has("documents: studio create kind", pfd, '"video", "post", "document", "article"');
has("documents: studio manage tab", pfd, 'const MANAGE_TABS = ["videos", "documents", "articles", "qa", "posts", "recs"];');
has("documents: Your content tab", pfd, '"all", "videos", "articles", "documents"');
has("documents: scripts and styles shipped", read("content.html") + read("profile.html"), "js/documents.js");
has("documents: night styles", read("css/documents.css"), ".doc-frame");

// ---------------- Studio: videos + playlists + documents together (2026-10-23) ---
const cs2 = read("js/content-studio.js");
has("studio: three kinds in create", cs2, '["video", "playlist", "document"]');
has("studio: three kinds in manage", cs2, 'const MGMT = ["videos", "documents", "playlists"];');
has("studio: sort options", cs2, 'const SORTS = ["newest", "oldest", "views"];');
has("studio: counts come from real rows", cs2, "const [vids, docs, pls] = await Promise.all([");
has("studio: document upload embedded in create", cs2, "window.CineAuraDocs.renderUpload(body, { member: state.member })");
has("studio: document manager embedded with the sort", cs2, "window.CineAuraDocs.renderManage(body, me(), { sort })");
has("studio: playlists are created in place", cs2, 'playlist_id: `IDP${Math.floor(100000000 + Math.random() * 900000000)}`');
has("studio: playlist manager lists owned lists", cs2, "async function drawPlaylistManage(box, sort)");
has("studio: videos table kept as-is", cs2, 'class="table vs-table vs-table--manage"');
has("documents: manager honours the studio sort", dcm, 'if (opts.sort === "views") rows = rows.slice().sort((a, b) => Number(b.views || 0) - Number(a.views || 0));');

// ---------------- Article editor: one editor for members and staff (2026-10-23) --
const aem = read("js/article-editor.js");
has("article editor: one module, mounted by article.html", aem, "window.CineAuraArticles = { mount, sanitize, canRead, bodyHtml, critOf };");
has("article editor: sanitises on the way in and out", aem, "function sanitize(html)");
has("article editor: scripts and on* attributes dropped", aem, 'if (["SCRIPT", "STYLE", "OBJECT", "EMBED", "LINK", "META"].includes(tag)) return el.remove();');
has("article editor: links forced safe", aem, 'el.setAttribute("rel", "noopener noreferrer nofollow");');
has("article editor: iframes only from YouTube/Vimeo", aem, "if (tag === \"IFRAME\" && !/^https:\\/\\/(www\\.)?(youtube\\.com|player\\.vimeo\\.com)\\//.test(el.getAttribute(\"src\") || \"\"))");
has("article editor: schedule and privacy", aem, "private_users: listStr(d.users)");
has("article editor: help needs a moderator for members", aem, 'status: d.inHelp && !staff ? "pending" : "published"');
has("article editor: ownership re-read before an edit", aem, "if (owner !== state.me.member_id && !staff)");
has("article editor: reader gate mirrors the promises", aem, "function canRead(row, viewer, staff = false)");
has("article editor: private gate by listed users", aem, "return Boolean(viewer && users.includes(viewer.username));");
has("article editor: body rendered sanitised on the public page", aem, "if (row.body_html) return sanitize(row.body_html);");
const cja = read("js/community.js");
has("article editor: New article opens it", cja, 'location.href = "./article.html";');
has("article editor: article page uses the rich body", cja, "const body = A ? A.bodyHtml(a) :");
has("article editor: drafts stay private", cja, 'if (a.status === "draft" && !mine)');
const pfa = read("js/profile.js");
has("article editor: studio Article opens it", pfa, '<a class="btn btn-primary" href="./article.html">${escapeHtml(t("ae.openEditor"))}</a>');
const pna = read("js/panel-admin.js");
has("article editor: panel has an Articles tab", pna, '["articles", t("pa.ct.articles")]');
has("article editor: panel writes with the same editor", pna, '<a class="btn btn-sm btn-primary" href="./article.html">${esc(t("pa.ct.newArticle"))}</a>');
has("article editor: panel approval leaves a trace", pna, 'body: JSON.stringify({ article_id: Number(id), reviewer_id: ctx.state.staff?.member_id || "", decision: approve ? "approved" : "rejected" })');
has("article editor: page ships the module and styles", read("article.html"), "js/article-editor.js");

// ---------------- Documents are scanned before they are stored (2026-10-23) ----
const vtfn = read("supabase/functions/vt-scan/index.ts");
has("scan: the key comes from the function environment", vtfn, 'Deno.env.get("VIRUSTOTAL_API_KEY")');
has("scan: hash lookup first, upload only when unknown", vtfn, "const known = await hashLookup(sha256);");
has("scan: malicious and suspicious block", vtfn, 'if (Number(stats.malicious || 0) > 0) return "malicious";');
has("scan: a new file is uploaded and polled", vtfn, "async function uploadAndAnalyse(file: File)");
has("scan: the endpoint answers with a verdict", vtfn, "return json({\n    verdict: scan.stats ? verdictOf(scan.stats) : \"unknown\",");
ok("scan: no key is written into the site or the function", !/[a-f0-9]{64}/.test(dcm) && !/[a-f0-9]{64}/.test(vtfn));
has("scan: the browser asks the function, never VirusTotal", dcm, "`${C().SUPABASE_URL}/functions/v1/${SCAN_FN}`");
has("scan: upload waits for a clean verdict", dcm, "if (!scanClean(scan)) {");
{
  const atScan = dcm.indexOf("const scan = await vtScan(file, sha256);");
  const atPut = dcm.indexOf("const okPut = await putFile(");
  ok("scan: the scan runs before putFile", atScan > 0 && atPut > atScan);
}
has("scan: fail-closed wording for an undeployed scanner", dcm, 'if (r.verdict === "not_deployed") return t("doc.scan.notDeployed");');
has("scan: public documents go to the public Documents folder", dcm, 'const folder = bucket === PUBLIC_BUCKET ? `${PUBLIC_FOLDER}/${me.member_id}` : me.member_id;');
has("scan: private and exclusive stay in the private bucket", dcm, 'const bucket = vis === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;');
has("scan: the verdict is stored with the document", dcm, "scan_status: scan.verdict,");
has("scan: sql refuses anything that is not clean", read("sql/community_documents_scan.sql"), "check (scan_status = 'clean')");
has("scan: deployment note ships with the function", read("supabase/functions/vt-scan/DEPLOY.md"), "supabase secrets set VIRUSTOTAL_API_KEY");

// ---------------- Task 43.A: post actions on cards
const js = read("js/profile.js");
has("p43: recommend republishes feed line", js, 'const kind = choice === "up" ? "vote_up" : "vote_down";');
has("p43: up-vote republished to updates", js, "kind,\n            post_id: postId,");
has("p43: down-vote deletes republish lines", js, "&post_id=eq.${restValue(postId)}&kind=in.(vote_up,vote_down)");
has("p43: feed suppresses own down-votes", js, "!downIds.has(r.post_id)");
has("p43: report button on cards", js, "data-report-post");
has("p43: report dialog", js, "postReportDlg(");
has("p43: down-vote hides for viewer", js, "/rest/v1/post_votes?member_id=eq.${restValue(state.me.member.member_id)}&vote=eq.down&select=post_id");

done();