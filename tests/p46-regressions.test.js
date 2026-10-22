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
