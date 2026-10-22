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
