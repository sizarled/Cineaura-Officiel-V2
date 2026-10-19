// Homepage – Live Updates aggregator – shows ALL updates in one place
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const LANG = () => document.documentElement.getAttribute('lang') || 'en';
  const tr = (ar, fr, en) => LANG()==='ar'?ar:(LANG()==='fr'?fr:en);

  const FILTERS = [
    { id:'all', label_ar:'الكل', label_fr:'Tout', label_en:'All' },
    { id:'market', label_ar:'المتجر', label_fr:'Boutique', label_en:'Market' },
    { id:'video', label_ar:'الفيديو', label_fr:'Vidéos', label_en:'Videos' },
    { id:'iptv', label_ar:'القنوات', label_fr:'IPTV', label_en:'IPTV' },
    { id:'movie', label_ar:'الأفلام', label_fr:'Films', label_en:'Movies' },
    { id:'promo', label_ar:'عروض', label_fr:'Offres', label_en:'Offers' },
  ];

  const esc = (s)=> String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function timeAgo(d){
    try{
      const diff = Date.now() - new Date(d).getTime();
      const m = Math.floor(diff/60000); if(m<1) return tr('الآن','À l\'instant','Just now');
      if(m<60) return `${m} ${tr('د','min','m')} `;
      const h=Math.floor(m/60); if(h<24) return `${h} ${tr('ساعة','h','h')} `;
      const days=Math.floor(h/24); return `${days} ${tr('يوم','j','d')} `;
    }catch{ return '—'; }
  }

  let allItems = [];
  let activeFilter = 'all';
  let visibleCount = 8;

  function renderChips(){
    const bar = $('#live-filters'); if(!bar) return;
    const counts = {}; for(const it of allItems) counts[it.kind]=(counts[it.kind]||0)+1;
    bar.innerHTML = FILTERS.map(f=>{
      const c = f.id==='all'? allItems.length : (counts[f.id]||0);
      const label = LANG()==='ar'?f.label_ar:(LANG()==='fr'?f.label_fr:f.label_en);
      return `<button class="live-chip ${activeFilter===f.id?'active':''}" data-filter="${f.id}" type="button">${esc(label)} <small>${c}</small></button>`;
    }).join('');
  }

  function filtered(){
    if(activeFilter==='all') return allItems;
    return allItems.filter(x=>x.kind===activeFilter);
  }

  function hasSelectionIn(el){
    try{
      const sel=window.getSelection&&window.getSelection();
      if(!sel||sel.isCollapsed||!sel.rangeCount) return false;
      if(!sel.toString().trim()) return false;
      const a=sel.anchorNode&&sel.anchorNode.parentElement, f=sel.focusNode&&sel.focusNode.parentElement;
      return (a&&el.contains(a))||(f&&el.contains(f));
    }catch{ return false; }
  }
  function renderGrid(){
    const grid = $('#live-grid'); if(!grid) return;
    // Don't destroy user text selection
    if(hasSelectionIn(grid)) return;
    const list = filtered().slice(0, visibleCount);
    const more = filtered().length > visibleCount;
    if(!allItems.length){ grid.innerHTML = `<div class="live-loading">${tr('جاري تحميل التحديثات…','Chargement…','Loading updates…')}</div>`; return; }
    if(!list.length){ grid.innerHTML = `<div class="live-empty">${tr('لا يوجد تحديث في هذا القسم حالياً.','Aucune actu dans cette catégorie.','No updates in this category yet.')}</div>`; return; }
    grid.innerHTML = list.map(it=>`
      <article class="live-card" data-kind="${it.kind}">
        <div class="live-media">${it.image?`<img src="${esc(it.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<span class="live-ico">${it.icon||'✦'}</span>`}</div>
        <div class="live-body">
          <div class="live-type ${it.kind}">${esc(it.badge||it.kind)} <span class="live-time">${esc(timeAgo(it.date))}</span></div>
          <div class="live-title-text">${esc(it.title)}</div>
          <div class="live-meta">${it.meta||''}</div>
          <div class="live-actions">
            ${it.href?`<a class="primary" href="${esc(it.href)}">${tr('عرض','Voir','View')}</a>`:''}
            ${it.href2?`<a href="${esc(it.href2)}">${tr('التفاصيل','Détails','Details')}</a>`:''}
          </div>
        </div>
      </article>
    `).join('') + `<div class="live-more" ${more?'':'hidden'}><button type="button" id="live-more-btn">${tr('عرض المزيد','Voir plus','Load more')} (${filtered().length - visibleCount})</button></div>`;
    $('#live-more-btn')?.addEventListener('click', ()=>{ visibleCount+=8; renderGrid(); });
  }

  async function fetchAll(){
    const items=[];
    const supa = () => window.supabase || window.supa || null;

    // 1) Announcements / banners – site_banner_get
    try{
      const s=supa();
      if(s){
        const { data, error } = await s.rpc('site_banner_get', { p_lang: LANG() }).maybeSingle?.() ?? await s.rpc('site_banner_get').maybeSingle?.();
        if(!error && data){
          const banner = Array.isArray(data)?data[0]:data;
          if(banner && (banner.message||banner.title)){
            items.push({ kind:'promo', badge: tr('إعلان','Annonce','Announcement'), title: banner.title||banner.message||banner.text||'', meta:`<span>${esc(banner.subtitle||'')}</span>`, image: banner.image||banner.cover||'', href: banner.link||banner.url||'index.html#live-updates', date: banner.created_at||banner.updated_at||banner.date||new Date().toISOString(), icon:'📢' });
          }
        }
      }
    }catch{}

    // 2) Market latest
    try{
      const s=supa();
      if(s){
        let rows=[];
        try{ const r=await s.rpc('market_home', { p_lang: LANG(), p_limit: 12 }); if(r?.data) rows = Array.isArray(r.data)?r.data:(r.data.items||r.data.products||[]); }catch{}
        if(!rows.length){ try{ const r=await s.rpc('market_search', { p_q:'', p_lang: LANG(), p_limit:12 }); if(r?.data) rows = Array.isArray(r.data)?r.data:(r.data.items||[]);}catch{} }
        for(const m of rows.slice(0,10)){
          items.push({ kind:'market', badge: tr('المتجر','Boutique','Market'), title: m.title||m.name||m.product_name||tr('منتج جديد','Nouveau produit','New product'), meta:`<span>${esc(m.store_name||m.seller||'Cineaura')}</span>${m.price?` · <b>${esc(m.price)} ${esc(m.currency||'MAD')}</b>`:''}`, image: m.image||m.cover||m.thumb||m.photo||'', href: `market.html#product-${m.id||m.product_id||''}`, date: m.created_at||m.updated_at||new Date(Date.now()-Math.floor(Math.random()*48)*3600000).toISOString(), icon:'🛒' });
        }
      }
    }catch{}

    // 3) Videos – content_search
    try{
      const s=supa();
      if(s){
        const r=await s.rpc('content_search', { p_q:'', p_limit:12 });
        const rows = r?.data ? (Array.isArray(r.data)?r.data:(r.data.items||r.data.videos||[])) : [];
        for(const v of rows.slice(0,10)){
          items.push({ kind:'video', badge: tr('فيديو','Vidéo','Video'), title: v.title||v.name||tr('فيديو جديد','Nouvelle vidéo','New video'), meta:`<span>${esc(v.channel||v.author||'Cineaura')}</span>${v.views?` · ${esc(v.views)} ${tr('مشاهدة','vues','views')}`:''}`, image: v.thumbnail||v.thumb||v.poster||v.cover||'', href: `watch.html#v-${v.id||v.content_id||''}` , date: v.created_at||v.published_at||new Date(Date.now()-Math.floor(Math.random()*72)*3600000).toISOString(), icon:'▶' });
        }
      }
    }catch{}

    // 4) IPTV lists
    try{
      const s=supa();
      if(s){
        const r=await s.rpc('iptv_lists_search', { p_q:'', p_limit:12 });
        const rows = r?.data ? (Array.isArray(r.data)?r.data:(r.data.items||r.data.lists||[])) : [];
        for(const l of rows.slice(0,8)){
          items.push({ kind:'iptv', badge:'IPTV', title: l.title||l.name||'IPTV', meta:`<span>${esc(l.country||l.provider||'')}</span>${l.channels?` · ${l.channels} ${tr('قناة','chaînes','channels')}`:''}`, image: l.logo||l.poster||'', href: `market.html#iptv-${l.id||''}`, date: l.created_at||new Date(Date.now()-Math.floor(Math.random()*24)*3600000).toISOString(), icon:'📺' });
        }
      }
    }catch{}

    // 5) TMDB trending (movies/series) as "what's new" cross-feed
    try{
      // main.js exposes window.__cineauraTrending if available; fallback: no-op (don't break)
      const trending = window.__cineauraTrending || window.__tmdbTrending || [];
      for(const t of trending.slice(0,6)){
        items.push({ kind:'movie', badge: t.media_type==='tv'? tr('مسلسل','Série','Series') : tr('فيلم','Film','Movie'), title: t.title||t.name||'', meta:`<span>TMDB</span> · ⭐ ${esc(t.vote_average||'—')}`, image: t.poster_path? `https://image.tmdb.org/t/p/w185${t.poster_path}` : (t.backdrop_path?`https://image.tmdb.org/t/p/w300${t.backdrop_path}`:''), href: `watch.html#tmdb-${t.id}`, date: t.release_date||t.first_air_date||new Date().toISOString(), icon:'🎬' });
      }
    }catch{}

    // 6) Points / levels teaser via memberPoints if exposed (fallback synthetic)
    try{
      const pts = window.memberPoints || window.__memberPoints;
      if(pts && pts.level){
        items.push({ kind:'promo', badge: tr('نقاط','Points','Points'), title: tr(`مستوى جديد: ${pts.level}` , `Nouveau palier : ${pts.level}`, `New milestone: ${pts.level}`), meta:`<span>${tr('نظام النقاط','Système de points','Points system')}</span>`, image:'', href:'index.html#points-levels', date:new Date().toISOString(), icon:'🏆' });
      }
    }catch{}

    // fallback if everything empty: synthetic examples so section never looks dead in demo
    if(!items.length){
      items.push(
        { kind:'market', badge: tr('المتجر','Boutique','Market'), title: tr('تحديث المتجر: منتجات جديدة يومياً','Actu boutique : nouveaux produits chaque jour','Store update: new products daily'), meta:'<span>Cineaura Market</span>', image:'', href:'market.html', date: new Date().toISOString(), icon:'🛒' },
        { kind:'video', badge: tr('فيديو','Vidéo','Video'), title: tr('أحدث الفيديوهات في المنصة','Dernières vidéos sur la plateforme','Latest videos on the platform'), meta:'<span>Cineaura</span>', image:'', href:'index.html#videos', date: new Date(Date.now()-3600000).toISOString(), icon:'▶' },
        { kind:'iptv', badge:'IPTV', title:'IPTV — '+tr('قوائم محدثة','listes mises à jour','lists updated'), meta:'', image:'', href:'index.html#iptv', date: new Date(Date.now()-7200000).toISOString(), icon:'📺' },
        { kind:'movie', badge: tr('الأفلام','Films','Movies'), title:'TMDB '+tr('الأكثر رواجاً','Tendances','Trending'), meta:'TMDB', image:'', href:'index.html#movies', date: new Date(Date.now()-10800000).toISOString(), icon:'🎬' },
      );
    }

    // Sort by date desc
    items.sort((a,b)=> new Date(b.date)-new Date(a.date));
    return items;
  }

  function bindFilterEvents(){
    $('#live-filters')?.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-filter]'); if(!btn) return;
      activeFilter = btn.dataset.filter;
      visibleCount = 8;
      $$('#live-filters .live-chip').forEach(c=>c.classList.toggle('active', c.dataset.filter===activeFilter));
      renderGrid();
    });
  }

  async function init(){
    const root = document.getElementById('live-updates');
    if(!root) return;
    const subtitle = root.querySelector('[data-live-subtitle]');
    if(subtitle){
      subtitle.textContent = tr('جميع المستجدات في مكان واحد — المتجر، الفيديو، IPTV، الأفلام والعروض','Toutes les nouveautés en un seul endroit — boutique, vidéos, IPTV, films et offres','All updates in one place — market, videos, IPTV, movies and offers');
    }
    bindFilterEvents();
    // expose hook so other scripts (main.js) can push TMDB trending without reload
    window.__cineauraPushTrending = (arr)=>{
      if(!Array.isArray(arr)||!arr.length) return;
      window.__cineauraTrending = arr;
      fetchAll().then(n=>{ allItems=n; renderChips(); renderGrid(); });
    };
    try{
      allItems = await fetchAll();
      renderChips();
      renderGrid();
    }catch(err){
      console.error('[live-updates]', err);
      const g=$('#live-grid'); if(g) g.innerHTML = `<div class="live-empty">${esc(String(err.message||err))}</div>`;
    }
    // periodic refresh (every 90s) – keeps "live" feel without spamming RPCs
    setInterval(async()=>{
      const n = await fetchAll().catch(()=>null);
      if(n && n.length){ allItems = n; renderChips(); renderGrid(); }
    }, 90000);
    // refresh also when language changes (main.js dispatches 'lang:change')
    window.addEventListener('lang:change', async()=>{
      allItems = await fetchAll(); renderChips(); renderGrid();
    });
    // if trending loads later, integrate
    window.addEventListener('tmdb:trending', (e)=>{
      if(e.detail?.length) window.__cineauraPushTrending(e.detail);
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
