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
has("profile nav: order, Your content unified", read("js/profile.js"), 'NAV_SECTIONS = ["home", "market", "create", "content", "posts", "messages", "search", "following", "blocked", "settings"]');
has("profile nav: Home renamed to Profile", read("js/i18n.js"), '"prof.home": "Profile"');

// ---------------- Dashboard sidebar journey groups (2026-10-22)
const dj = read("js/dashboard.js");
has("dashboard nav: Main group first", dj, '["dash.grp.main", ["overview", "level", "points"]]');
has("dashboard nav: content tools group", dj, '["dash.grp.content", ["upload", "links", "codes", "playlists", "iptv"]]');
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
has("community: hub module", cj, "window.CineAuraCommunity = { viewCommunity, memberView, memberBlocks };");
has("community: question route", cj, '#q/${row.id}');
has("community: deep-link router", cj, "const hashRoute = ()");
has("community: helpful vote toggle", cj, "community_answer_votes");
has("community: only boots on hub page", cj, 'if (root) paint(root);');
ok("community: page exists", fs.existsSync(path.join(ROOT, "community.html")));
has("community: page loads module", read("community.html"), 'src="js/community.js"');
has("community: page styling", fs.existsSync(path.join(ROOT, "css/community.css")) ? read("css/community.css") : "", ".com-tabs .follow-tab.active");
const pf2 = read("js/profile.js");
has("content hub: type filter tabs", pf2, 'CONTENT_TYPES = ["all", "videos", "articles", "questions", "answers"]');
has("content hub: videos delegate to studio", pf2, "window.CineAuraStudio.render(body.querySelector(\"#ct-videos\"), { member })");
has("content hub: community blocks by memberBlocks", pf2, "window.CineAuraCommunity.memberBlocks(body, hostId, vt)");
has("content hub: engine tab all", read("js/i18n.js"), '"prof.ct.all": "All content"');
has("community: profile deep-link whitelist", pf2, '"home","market","create","content","posts","messages","search","following","blocked","settings"');
has("community: Create offers Article + Question", pf2, './community.html#new-article');
has("community: Create offers Question", pf2, './community.html#ask');
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
has("deep: router reads the four params", cj4, 'const routes = ["video", "article", "question", "answer"];');
has("deep: invalid mixed route", cj4, "if (selected.length > 1) return invalid();");
has("deep: numeric id guard", cj4, "if (!id || !/^\\d+$/.test(id)) return invalid();");
has("deep: video left to content.js", cj4, 'if (selected[0] === "video") return false;');
has("deep: boot gives the router priority", cj4, "if (!contentDeepView()) wireContentTabs();");
has("deep: answer view with parent question", cj4, "questionView(box, a.question_id, a.id);");
has("deep: answer highlight anchor", cj4, 'data-ans="${a.id}"');

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