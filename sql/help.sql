-- ============================================================
-- CineAura — Help Center (مركز المساعدة)
-- Run in Supabase SQL editor (safe to run more than once)
-- Tables: help_categories, help_articles, help_article_categories,
--         help_article_votes, help_article_comments
-- Public can read published articles; authenticated can vote/comment;
-- panel (service_role / via JS with anon key) can manage.
-- ============================================================

-- 1. Categories  (main sections + subsections)
create table if not exists public.help_categories (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  name_ar text not null default '',
  parent_id bigint references public.help_categories(id) on delete cascade,
  sort_order integer not null default 0,
  icon text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists help_categories_parent_idx on public.help_categories(parent_id);
create index if not exists help_categories_sort_idx on public.help_categories(sort_order);

-- 2. Articles
create table if not exists public.help_articles (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  content_html text not null default '',
  content_css text not null default '',
  language text not null default 'en' check (language in ('en','ar','fr','de','es','nl','it')),
  country text not null default 'global',
  status text not null default 'draft' check (status in ('draft','published')),
  author_id text not null default '',
  author_name text not null default '',
  category_id bigint references public.help_categories(id) on delete set null,
  views integer not null default 0,
  reading_minutes integer not null default 2,
  helpful_count integer not null default 0,
  unhelpful_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists help_articles_status_idx on public.help_articles(status);
create index if not exists help_articles_lang_idx on public.help_articles(language);
create index if not exists help_articles_country_idx on public.help_articles(country);
create index if not exists help_articles_category_idx on public.help_articles(category_id);
create index if not exists help_articles_slug_idx on public.help_articles(slug);
-- full-text search (simple ilike, but add tsv for future)
alter table public.help_articles add column if not exists search_tsv tsvector generated always as (
  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content_html,''))
) stored;
create index if not exists help_articles_tsv_idx on public.help_articles using gin(search_tsv);

-- trigger: updated_at
create or replace function public.help_touch_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists help_articles_touch on public.help_articles;
create trigger help_articles_touch before update on public.help_articles for each row execute function public.help_touch_updated();

-- 3. Many-to-many article ↔ categories (article can belong to several sections)
create table if not exists public.help_article_categories (
  article_id bigint not null references public.help_articles(id) on delete cascade,
  category_id bigint not null references public.help_categories(id) on delete cascade,
  primary key (article_id, category_id)
);

-- 4. Helpful / Not helpful votes (one per member per article)
create table if not exists public.help_article_votes (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.help_articles(id) on delete cascade,
  member_id text not null,
  helpful boolean not null, -- true = مفيد, false = غير مفيد
  created_at timestamptz not null default now(),
  unique(article_id, member_id)
);
create index if not exists help_votes_article_idx on public.help_article_votes(article_id);

-- 5. Comments
create table if not exists public.help_article_comments (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.help_articles(id) on delete cascade,
  member_id text not null,
  username text not null default '',
  avatar_url text not null default '',
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists help_comments_article_idx on public.help_article_comments(article_id, created_at desc);

-- 6. Views helper: increment views atomically
create or replace function public.help_increment_view(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.help_articles set views = views + 1 where id = p_id;
end $$;

-- 7. Vote helper: upsert vote and update counters
create or replace function public.help_vote(p_article bigint, p_member text, p_helpful boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v_helpful boolean;
declare existed boolean := false;
begin
  select helpful into v_helpful from public.help_article_votes where article_id = p_article and member_id = p_member;
  if found then
    existed := true;
    if v_helpful = p_helpful then
      -- toggle off: remove vote
      delete from public.help_article_votes where article_id = p_article and member_id = p_member;
      if p_helpful then
        update public.help_articles set helpful_count = greatest(0, helpful_count - 1) where id = p_article;
      else
        update public.help_articles set unhelpful_count = greatest(0, unhelpful_count - 1) where id = p_article;
      end if;
      return json_build_object('action','removed');
    else
      update public.help_article_votes set helpful = p_helpful where article_id = p_article and member_id = p_member;
      if p_helpful then
        update public.help_articles set helpful_count = helpful_count + 1, unhelpful_count = greatest(0, unhelpful_count - 1) where id = p_article;
      else
        update public.help_articles set unhelpful_count = unhelpful_count + 1, helpful_count = greatest(0, helpful_count - 1) where id = p_article;
      end if;
      return json_build_object('action','switched');
    end if;
  else
    insert into public.help_article_votes(article_id, member_id, helpful) values (p_article, p_member, p_helpful);
    if p_helpful then
      update public.help_articles set helpful_count = helpful_count + 1 where id = p_article;
    else
      update public.help_articles set unhelpful_count = unhelpful_count + 1 where id = p_article;
    end if;
    return json_build_object('action','added');
  end if;
end $$;

-- RLS: permissive for anon (reads) – panel writes via anon key (Supabase JS uses anon key with RLS)
alter table public.help_categories enable row level security;
alter table public.help_articles enable row level security;
alter table public.help_article_categories enable row level security;
alter table public.help_article_votes enable row level security;
alter table public.help_article_comments enable row level security;

do $$ declare t text; p record; begin
  foreach t in array array['help_categories','help_articles','help_article_categories','help_article_votes','help_article_comments'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- public read
create policy help_cat_read on public.help_categories for select using (true);
create policy help_art_read on public.help_articles for select using (true);
create policy help_artcat_read on public.help_article_categories for select using (true);
create policy help_vote_read on public.help_article_votes for select using (true);
create policy help_comment_read on public.help_article_comments for select using (true);
-- writes allowed (panel auth via JS checks role, not RLS – keep open foranon with checks in app)
create policy help_cat_write on public.help_categories for all using (true) with check (true);
create policy help_art_write on public.help_articles for all using (true) with check (true);
create policy help_artcat_write on public.help_article_categories for all using (true) with check (true);
create policy help_vote_write on public.help_article_votes for all using (true) with check (true);
create policy help_comment_write on public.help_article_comments for all using (true) with check (true);

grant all on public.help_categories to anon, authenticated;
grant all on public.help_articles to anon, authenticated;
grant all on public.help_article_categories to anon, authenticated;
grant all on public.help_article_votes to anon, authenticated;
grant all on public.help_article_comments to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on function public.help_increment_view(bigint) to anon, authenticated;
grant execute on function public.help_vote(bigint, text, boolean) to anon, authenticated;

-- seed: main sections + subsections (Arabic names, English fallback)
insert into public.help_categories (slug, name, name_ar, sort_order) values
  ('getting-started','Getting Started','البدء',1),
  ('account','Account & Access','الحساب والدخول',2),
  ('watching','Watching','المشاهدة',3),
  ('iptv-help','IPTV','قنوات IPTV',4),
  ('market-help','Market','المتجر',5),
  ('prizes-help','Prizes & Points','الجوائز والنقاط',6)
on conflict (slug) do nothing;

-- subsections (parent = main)
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'gs-register', 'Create account', 'إنشاء حساب', c.id, 1 from public.help_categories c where c.slug='getting-started' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'gs-activate', 'Activate membership', 'تفعيل العضوية', c.id, 2 from public.help_categories c where c.slug='getting-started' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'acc-profile', 'Profile & Settings', 'الملف والإعدادات', c.id, 1 from public.help_categories c where c.slug='account' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'acc-codes', 'Access codes', 'رموز الدخول', c.id, 2 from public.help_categories c where c.slug='account' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'watch-links', 'Watch links', 'روابط المشاهدة', c.id, 1 from public.help_categories c where c.slug='watching' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'watch-player', 'Player & Quality', 'المشغل والجودة', c.id, 2 from public.help_categories c where c.slug='watching' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'iptv-free', 'Free channels', 'القنوات المجانية', c.id, 1 from public.help_categories c where c.slug='iptv-help' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'iptv-premium', 'Premium channels', 'القنوات المميزة', c.id, 2 from public.help_categories c where c.slug='iptv-help' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'mkt-buy', 'Buying', 'الشراء', c.id, 1 from public.help_categories c where c.slug='market-help' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'mkt-sell', 'Selling', 'البيع', c.id, 2 from public.help_categories c where c.slug='market-help' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'prize-join', 'How to join', 'كيف تشارك', c.id, 1 from public.help_categories c where c.slug='prizes-help' on conflict (slug) do nothing;
insert into public.help_categories (slug, name, name_ar, parent_id, sort_order)
select 'prize-points', 'Points & Levels', 'النقاط والمستويات', c.id, 2 from public.help_categories c where c.slug='prizes-help' on conflict (slug) do nothing;

-- demo articles (3) – shows system works before editor is used
insert into public.help_articles (slug, title, summary, content_html, language, country, status, category_id, reading_minutes, published_at)
select 'how-to-register', 'How to create your CineAura account', 'Step-by-step to register, save your recovery code and verify your email.',
  '<h2>Welcome to CineAura</h2><p>Create an account in 1 minute. You need a username, email and password.</p><blockquote>💡 Save your recovery code — it is the only way to restore your password.</blockquote><h3>Steps</h3><ol><li>Open <a href="./register.html">Register</a></li><li>Fill your name, email, password</li><li>Copy your recovery code</li><li>Activate your plan from <a href="./activate.html">Activate</a></li></ol><p><img src="https://images.unsplash.com/photo-1555421689-3f034debb7a6?w=800" alt="register" style="max-width:100%;border-radius:12px" /></p>',
  'en','global','published', sc.id, 2, now()
from public.help_categories sc where sc.slug='gs-register' on conflict (slug) do nothing;

insert into public.help_articles (slug, title, summary, content_html, language, country, status, category_id, reading_minutes, published_at)
select 'access-codes-explained', 'Access codes — what they do', 'Every title needs a 6-digit code. Learn how codes, devices and age limits work.',
  '<h2>Access codes</h2><p>An access code unlocks movies, series and premium IPTV. Your plan decides how many codes you can create and how long they live.</p><h3>Rules</h3><ul><li>One code = one device</li><li>Remember the code to avoid re-entry</li><li>13+ titles always ask for a code</li></ul><p>Manage them in <a href="./dashboard.html">Dashboard → Codes</a>.</p>',
  'ar','global','published', sc.id, 3, now()
from public.help_categories sc where sc.slug='acc-codes' on conflict (slug) do nothing;

insert into public.help_articles (slug, title, summary, content_html, language, country, status, category_id, reading_minutes, published_at)
select 'watch-links-guide', 'Publish a watch link', 'Share a playback link for any TMDB title and appear on its watch page.',
  '<h2>Share a source</h2><p>Go to Dashboard → Links, paste the TMDB URL and your playback URL.</p><blockquote>Only share links you are allowed to publish.</blockquote><h3>Quality</h3><p>Pick every quality your source offers.</p>',
  'en','global','published', sc.id, 2, now()
from public.help_categories sc where sc.slug='watch-links' on conflict (slug) do nothing;
