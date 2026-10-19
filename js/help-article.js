/**
 * CineAura — WordPress-like Article Editor (Article.html)
 * Upgraded to professional UX similar to WordPress Gutenberg (2025)
 * Keeps existing Supabase schema: help_articles + help_article_categories
 * Features: WP header, document sidebar, block inserter, table, media modals,
 * undo/redo, headings, alignment, colors, LTR/RTL, drag-drop, autosave, word count,
 * SEO preview, categories hierarchy with search.
 */
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const esc = (v) => (window.CineAura && window.CineAura.escapeHtml) ? window.CineAura.escapeHtml(String(v||'')) : String(v||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = (k, vars) => window.CineAura && window.CineAura.t ? window.CineAura.t(k,vars) : k;
  const toast = (m) => window.CineAura && window.CineAura.toast ? window.CineAura.toast(m) : alert(m);
  const supabaseRequest = window.CineAura ? window.CineAura.supabaseRequest : null;
  const getSession = () => window.CineAura && window.CineAura.getSession ? window.CineAura.getSession() : null;

  const LANGS = ['en','ar','fr','de','es','nl','it'];
  const COUNTRIES = ['global','MA','FR','US','DE','ES','IT','NL','GB','SA','EG','DZ','TN','TR','IN','BR','CA','AE','QA','KW','LB','JO','IQ','YE','SD','LY','OM','BH'];

  let articleId = null;
  let autosaveTimer = null;
  let isDirty = false;
  let saveLock = false;
  let lastSavedAt = null;
  let savedSelection = null;

  function qId(){ return new URLSearchParams(location.search).get('id'); }
  function slugify(title){
    return String(title||'').toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06FF]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'article-'+Date.now().toString(36);
  }
  function readingMinutes(html){
    const text = String(html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    const words = text ? text.split(' ').filter(Boolean).length : 0;
    return Math.max(1, Math.ceil(words/200));
  }
  function wordCount(html){
    const text = String(html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    return text ? text.split(' ').filter(Boolean).length : 0;
  }
  async function fetchCategories(){
    if(!supabaseRequest) return [];
    const res = await supabaseRequest('/rest/v1/help_categories?select=*&order=sort_order.asc');
    return res.ok && Array.isArray(res.data) ? res.data : [];
  }
  async function fetchArticle(id){
    if(!id || !supabaseRequest) return null;
    const res = await supabaseRequest(`/rest/v1/help_articles?id=eq.${id}&select=*`);
    if(res.ok && res.data && res.data[0]) return res.data[0];
    return null;
  }
  async function fetchArticleCats(id){
    if(!id || !supabaseRequest) return [];
    const res = await supabaseRequest(`/rest/v1/help_article_categories?article_id=eq.${id}&select=category_id`);
    return res.ok && Array.isArray(res.data) ? res.data.map(r=> r.category_id) : [];
  }

  // Save/restore selection for modals
  function saveSelection(){
    const sel = window.getSelection();
    if(sel && sel.rangeCount>0) savedSelection = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection(){
    if(!savedSelection) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSelection);
  }

  function exec(cmd, val=null){
    document.execCommand(cmd, false, val);
    const canvas = $('#ed-canvas');
    if(canvas) canvas.focus();
    markDirty();
    updateWordCount();
  }
  function execBlock(tag){
    // Use formatBlock with tag wrapping
    document.execCommand('formatBlock', false, tag);
    markDirty();
    updateWordCount();
  }
  function insertHTML(html){
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    markDirty();
    updateWordCount();
  }
  function markDirty(){ isDirty=true; const el=$('#ed-save-state'); if(el) el.textContent = '• '+ (t('help.unsaved')||'Unsaved changes'); }
  function updateWordCount(){
    const canvas = $('#ed-canvas');
    if(!canvas) return;
    const wc = wordCount(canvas.innerHTML);
    const rm = readingMinutes(canvas.innerHTML);
    const wcEl = $('#wp-wordcount');
    const rmEl = $('#wp-reading');
    if(wcEl) wcEl.textContent = wc + ' ' + (t('help.words')||'words');
    if(rmEl) rmEl.textContent = rm + ' ' + (t('common.minutes')||'min read');
  }

  function catTreeHTML(categories, checkedIds){
    const roots = categories.filter(c=> !c.parent_id);
    let html='';
    roots.forEach(root=>{
      const subs = categories.filter(c=> c.parent_id===root.id);
      html+= `<div class="wp-cat-group"><div class="wp-cat-head"><strong>${esc(root.name_ar||root.name)}</strong><span class="wp-cat-count">${subs.length||1}</span></div>`;
      if(!subs.length){
        const checked = checkedIds.includes(root.id) ? 'checked' : '';
        html+= `<label class="wp-cat-item"><input type="checkbox" name="cats" value="${root.id}" ${checked}> <span>${esc(root.name_ar||root.name)}</span></label>`;
      } else {
        subs.forEach(s=>{
          const checked = checkedIds.includes(s.id) ? 'checked' : '';
          html+= `<label class="wp-cat-item"><input type="checkbox" name="cats" value="${s.id}" ${checked}> <span>${esc(s.name_ar||s.name)}</span><small>${esc(s.slug)}</small></label>`;
        });
      }
      html+= `</div>`;
    });
    if(!roots.length && categories.length){
      categories.forEach(c=>{
        const checked = checkedIds.includes(c.id) ? 'checked' : '';
        html+= `<label class="wp-cat-item"><input type="checkbox" name="cats" value="${c.id}" ${checked}> <span>${esc(c.name_ar||c.name)}</span></label>`;
      });
    }
    return html || `<p style="color:var(--muted);font-size:13px">${t('help.noCategories')||'No categories yet — create in Help Center.'}</p>`;
  }

  function renderEditor(categories, data, extraCatIds){
    const isNew = !data;
    const checkedIds = [...extraCatIds];
    if(data && data.category_id && !checkedIds.includes(data.category_id)) checkedIds.push(data.category_id);
    const titleVal = esc(data?.title||'');
    const slugVal = esc(data?.slug||'');
    const summaryVal = esc(data?.summary||'');
    const langVal = data?.language || 'en';
    const countryVal = data?.country || 'global';
    const statusVal = data?.status || 'draft';
    const contentHtml = data?.content_html || '<p>ابدأ الكتابة هنا… اكتب الفقرة الأولى، ثم استخدم شريط الأدوات أو زر <strong>+ إضافة كتلة</strong> لإدراج عناوين، صور، قوائم وجداول.</p><p>Tip: Paste an image, drag & drop, or use <em>Insert → Media</em>. Select text for quick formatting.</p>';
    const contentCss = data?.content_css || '';
    const catHTML = catTreeHTML(categories, checkedIds);
    const author = data?.author_name || getSession()?.username || '';

    return `
    <div class="wp-editor">
      <!-- WP Top Bar -->
      <header class="wp-editor-header">
        <div class="wp-header-left">
          <a href="./panel.html#help" class="wp-back" title="${t('help.backPanel')||'Back to Panel'}">‹</a>
          <span class="wp-logo" aria-hidden="true">W</span>
          <div class="wp-header-title">
            <strong id="wp-title-display">${titleVal ? titleVal.slice(0,28) : (t('help.newArticle')||'New Article')}</strong>
            <small id="ed-save-state" class="wp-save-state">${isNew ? (t('help.new')||'New — not saved') : (t('help.saved')||'Saved')}</small>
          </div>
        </div>
        <div class="wp-header-center">
          <button type="button" class="wp-tab active" data-wp-tab="edit">✎ ${t('help.tabVisual')||'Edit'}</button>
          <button type="button" class="wp-tab" data-wp-tab="code">${t('help.tabCode')||'Code'}</button>
          <button type="button" class="wp-tab" data-wp-tab="preview">👁 ${t('help.preview')||'Preview'}</button>
        </div>
        <div class="wp-header-right">
          <span class="wp-device" id="wp-wordcount" title="Word count">0 ${t('help.words')||'words'}</span>
          <button type="button" class="btn btn-sm btn-ghost" id="wp-fullscreen" title="Fullscreen">⛶</button>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-save">${t('common.save')||'Save Draft'}</button>
          <button type="button" class="btn btn-sm btn-primary" id="btn-publish">${statusVal==='published' ? (t('common.update')||'Update') : (t('help.publish')||'Publish')}</button>
          <button type="button" class="wp-icon-btn" id="wp-settings-toggle" title="${t('help.settings')||'Settings'}">⚙</button>
        </div>
      </header>

      <div class="wp-layout">
        <main class="wp-main">
          <!-- Title + Permalink -->
          <div class="wp-title-wrap">
            <input id="ed-title" class="wp-title-input" type="text" placeholder="${t('help.titlePlaceholder')||'Add title — أضف العنوان'}" value="${titleVal}" />
            <div class="wp-permalink" id="wp-permalink">
              <span class="wp-permalink-label">${t('help.permalink')||'Permalink:'}</span>
              <span class="wp-permalink-url">${location.origin}${location.pathname.replace('Article.html','help.html')}?slug=<span id="wp-slug-preview">${slugVal || slugify(titleVal)||'your-title'}</span></span>
              <button type="button" class="wp-link-btn" id="wp-edit-slug-btn">${t('common.edit')||'Edit'}</button>
              <span class="wp-slug-edit" id="wp-slug-edit" hidden>
                <input id="ed-slug" type="text" placeholder="auto-from-title" value="${slugVal}" />
                <button type="button" id="wp-slug-save" class="btn btn-xs btn-primary">OK</button>
              </span>
            </div>
          </div>

          <!-- Formatting Toolbar (WordPress-like groups) -->
          <div class="wp-toolbar" id="ed-toolbar">
            <div class="wp-tool-group" title="History">
              <button type="button" data-cmd="undo" title="Undo (Ctrl+Z)">↩</button>
              <button type="button" data-cmd="redo" title="Redo (Ctrl+Shift+Z)">↪</button>
            </div>
            <div class="wp-tool-group">
              <select id="tb-block" title="Paragraph / Heading">
                <option value="p">Paragraph</option>
                <option value="h1">H1</option>
                <option value="h2">H2</option>
                <option value="h3">H3</option>
                <option value="h4">H4</option>
                <option value="pre">Preformatted</option>
                <option value="blockquote">Quote</option>
              </select>
            </div>
            <div class="wp-tool-group">
              <button type="button" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
              <button type="button" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
              <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
              <button type="button" data-cmd="strikeThrough" title="Strikethrough">S</button>
            </div>
            <div class="wp-tool-group">
              <select id="tb-font" title="Font">
                <option value="">Font — الخط</option>
                <option value="Outfit, sans-serif">Outfit</option>
                <option value="Cairo, sans-serif">Cairo</option>
                <option value="'Cormorant Garamond', serif">Cormorant</option>
                <option value="monospace">Monospace</option>
                <option value="serif">Serif</option>
              </select>
              <select id="tb-size" title="Size">
                <option value="">Size</option>
                <option value="12px">12</option>
                <option value="14px">14</option>
                <option value="16px">16</option>
                <option value="18px">18</option>
                <option value="20px">20</option>
                <option value="24px">24</option>
                <option value="28px">28</option>
                <option value="32px">32</option>
              </select>
              <label class="wp-color" title="Text color"><input type="color" id="tb-color" value="#f4fbff" /></label>
              <label class="wp-color" title="Highlight"><input type="color" id="tb-hilite" value="#01b4e4" /></label>
            </div>
            <div class="wp-tool-group">
              <button type="button" data-cmd="justifyLeft" title="Align left">⬅</button>
              <button type="button" data-cmd="justifyCenter" title="Center">≡</button>
              <button type="button" data-cmd="justifyRight" title="Right">➡</button>
              <button type="button" data-cmd="justifyFull" title="Justify">≣</button>
              <button type="button" id="tb-ltr" title="LTR">LTR</button>
              <button type="button" id="tb-rtl" title="RTL">RTL</button>
            </div>
            <div class="wp-tool-group">
              <button type="button" data-cmd="insertUnorderedList" title="Bullet list">• List</button>
              <button type="button" data-cmd="insertOrderedList" title="Numbered list">1.</button>
              <button type="button" id="tb-indent" title="Indent">→ Indent</button>
              <button type="button" id="tb-outdent" title="Outdent">← Outdent</button>
              <button type="button" data-cmd="removeFormat" title="Clear formatting">✕ Clear</button>
            </div>
            <div class="wp-tool-group">
              <button type="button" id="tb-link" title="Add link">🔗 Link</button>
              <button type="button" id="tb-image" title="Add image">🖼 Image</button>
              <button type="button" id="tb-gallery" title="Gallery">▦ Gallery</button>
              <button type="button" id="tb-video" title="Video embed">▶ Media</button>
              <button type="button" id="tb-table" title="Insert table">▭ Table</button>
              <button type="button" id="tb-button" title="Insert button">⬔ Button</button>
              <button type="button" id="tb-hr" title="Separator">― HR</button>
              <button type="button" id="tb-code" title="Code block">&lt;/&gt;</button>
            </div>
          </div>

          <!-- Canvas + Block inserter -->
          <div class="wp-canvas-wrap">
            <div id="tab-visual">
              <div id="ed-canvas" class="wp-canvas" contenteditable="true" data-placeholder="ابدأ الكتابة… Start writing or type / for blocks — اكتب مقالك هنا">${contentHtml}</div>
              <div class="wp-inserter">
                <button type="button" id="wp-add-block" class="wp-inserter-btn">＋ ${t('help.addBlock')||'Add block'}</button>
                <div id="wp-block-menu" class="wp-block-menu" hidden>
                  <button type="button" data-block="paragraph"><span>¶</span> ${t('help.blockParagraph')||'Paragraph'}</button>
                  <button type="button" data-block="h2"><span>H2</span> ${t('help.blockHeading')||'Heading'}</button>
                  <button type="button" data-block="list"><span>•</span> ${t('help.blockList')||'List'}</button>
                  <button type="button" data-block="quote"><span>❝</span> ${t('help.blockQuote')||'Quote'}</button>
                  <button type="button" data-block="image"><span>🖼</span> ${t('help.blockImage')||'Image'}</button>
                  <button type="button" data-block="gallery"><span>▦</span> ${t('help.blockGallery')||'Gallery'}</button>
                  <button type="button" data-block="video"><span>▶</span> ${t('help.blockVideo')||'Video'}</button>
                  <button type="button" data-block="table"><span>▭</span> ${t('help.blockTable')||'Table'}</button>
                  <button type="button" data-block="code"><span>&lt;/&gt;</span> ${t('help.blockCode')||'Code'}</button>
                  <button type="button" data-block="separator"><span>―</span> ${t('help.blockSeparator')||'Separator'}</button>
                  <button type="button" data-block="button"><span>⬔</span> ${t('help.blockButton')||'Button'}</button>
                  <button type="button" data-block="embed"><span>🔗</span> ${t('help.blockEmbed')||'Embed'}</button>
                </div>
              </div>
            </div>
            <div id="tab-code" hidden>
              <div class="wp-code-area">
                <div class="wp-code-col"><label>HTML — ${t('help.htmlTab')||'HTML'}</label><textarea id="ed-html" placeholder="<h2>Title</h2><p>..."></textarea></div>
                <div class="wp-code-col"><label>CSS — ${t('help.cssTab')||'CSS'}</label><textarea id="ed-css" placeholder=".my-class { color: ... }"></textarea></div>
              </div>
              <div class="wp-code-actions">
                <button class="btn btn-sm btn-ghost" id="btn-apply-code" type="button">↓ ${t('help.applyToEditor')||'Apply to editor'}</button>
                <button class="btn btn-sm btn-ghost" id="btn-extract-code" type="button">↑ ${t('help.extractFromEditor')||'Extract from editor'}</button>
                <span class="wp-hint">${t('help.codeHint')||'Custom CSS is scoped to this article preview.'}</span>
              </div>
            </div>
            <div id="tab-preview" hidden>
              <div class="wp-preview-box"><div id="ed-preview" class="wp-preview"></div></div>
            </div>
          </div>

          <!-- Bottom status bar like WordPress -->
          <div class="wp-statusbar">
            <span id="wp-last-edited">${author ? '✍ '+esc(author)+' · ' : ''}${data?.updated_at ? new Date(data.updated_at).toLocaleString() : (isNew ? (t('help.newDraft')||'New draft') : '')}</span>
            <span id="wp-status-msg" class="wp-status-msg"></span>
            <span class="wp-status-actions">
              <a href="./help.html" class="wp-link">${t('help.viewHelp')||'View Help'}</a>
              <span>·</span>
              <a href="./panel.html#help" class="wp-link">${t('help.backPanel')||'Back to Panel'}</a>
            </span>
          </div>
        </main>

        <!-- Sidebar Document -->
        <aside class="wp-sidebar" id="wp-sidebar">
          <div class="wp-sidebar-tabs">
            <button type="button" data-sidebar="document" class="active">${t('help.tabDocument')||'Document'}</button>
            <button type="button" data-sidebar="block">${t('help.tabBlock')||'Block'}</button>
          </div>
          <div class="wp-sidebar-body" id="wp-sidebar-body">
            <details class="wp-panel" open>
              <summary>${t('help.panelStatus')||'Status & Visibility'}</summary>
              <div class="wp-panel-body">
                <label class="wp-label">${t('common.status')||'Status'}</label>
                <select id="ed-status" class="wp-select"><option value="draft" ${statusVal==='draft'?'selected':''}>${t('help.draft')||'Draft'}</option><option value="published" ${statusVal==='published'?'selected':''}>${t('help.published')||'Published'}</option></select>
                <label class="wp-label" style="margin-top:10px;display:flex;align-items:center;gap:8px"><input type="checkbox" id="ed-autosave" checked /> ${t('help.autosave')||'Autosave'} <small style="color:var(--muted)">4s</small></label>
                <div class="wp-meta-grid">
                  <span>${t('help.author')||'Author'}</span><b>${esc(author||'—')}</b>
                  <span>${t('help.created')||'Created'}</span><b>${data?.created_at ? new Date(data.created_at).toLocaleDateString() : '—'}</b>
                  <span>${t('help.updated')||'Updated'}</span><b>${data?.updated_at ? new Date(data.updated_at).toLocaleDateString() : '—'}</b>
                  <span>${t('help.views')||'Views'}</span><b>${data?.views||0}</b>
                </div>
                <div class="wp-lang-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
                  <label class="wp-label">${t('common.language')||'Language'}<select id="ed-lang" class="wp-select">${LANGS.map(l=> `<option value="${l}" ${langVal===l?'selected':''}>${l.toUpperCase()}</option>`).join('')}</select></label>
                  <label class="wp-label">${t('common.country')||'Country'}<select id="ed-country" class="wp-select">${COUNTRIES.map(c=> `<option value="${c}" ${countryVal===c?'selected':''}>${c==='global'? (t('help.global')||'Global'): c}</option>`).join('')}</select></label>
                </div>
              </div>
            </details>

            <details class="wp-panel" open>
              <summary>${t('help.permalink')||'Permalink'}</summary>
              <div class="wp-panel-body">
                <div class="wp-permalink-edit">
                  <span class="wp-permalink-preview">${location.origin}/help.html?slug=<b id="wp-slug-preview2">${slugVal||'—'}</b></span>
                  <div class="wp-field-inline">
                    <input id="ed-slug2" type="text" value="${slugVal}" placeholder="auto-from-title" />
                  </div>
                  <small style="color:var(--muted)">${t('help.slugHint')||'Leave empty to auto-generate from title.'}</small>
                </div>
              </div>
            </details>

            <details class="wp-panel" open>
              <summary>${t('help.categories')||'Categories'}</summary>
              <div class="wp-panel-body">
                <input type="search" id="wp-cat-search" placeholder="${t('help.searchPh')||'Search categories…'}" class="wp-search" />
                <div id="ed-cats" class="wp-cats">${catHTML}</div>
                <small style="color:var(--muted);display:block;margin-top:8px">${t('help.catHint')||'Choose one or more sections.'}</small>
              </div>
            </details>

            <details class="wp-panel">
              <summary>${t('help.summary')||'Excerpt'} / ${t('common.summary')||'Summary'}</summary>
              <div class="wp-panel-body">
                <textarea id="ed-summary" rows="4" placeholder="${t('help.summaryPh')||'Short summary for cards and SEO...'}" class="wp-textarea">${summaryVal}</textarea>
                <small style="color:var(--muted)"><span id="wp-excerpt-count">0</span>/160</small>
              </div>
            </details>

            <details class="wp-panel">
              <summary>${t('help.featuredImage')||'Featured image'}</summary>
              <div class="wp-panel-body">
                <div id="wp-featured-preview" class="wp-featured-preview">${data?.content_html && data.content_html.includes('<img') ? `<small style="color:var(--muted)">${t('help.featuredHint')||'First image in content will be used as thumbnail.'}</small>` : `<small style="color:var(--muted)">No image yet — insert an image in content.</small>`}</div>
                <button type="button" class="btn btn-sm btn-ghost" id="wp-set-featured" style="margin-top:8px">＋ ${t('help.setFeatured')||'Set featured image'}</button>
                <input type="file" id="wp-featured-file" accept="image/*" hidden />
              </div>
            </details>

            <details class="wp-panel">
              <summary>${t('help.customCss')||'Custom CSS'}</summary>
              <div class="wp-panel-body">
                <textarea id="ed-css-panel" rows="5" placeholder=".my-class { color: ... }" class="wp-textarea code">${esc(contentCss)}</textarea>
              </div>
            </details>

            <div class="wp-panel-actions">
              <button class="btn btn-lg btn-primary" id="btn-save-2" type="button" style="width:100%">${t('common.save')||'Save Draft'}</button>
              <button class="btn btn-lg btn-ghost" id="btn-publish-2" type="button" style="width:100%">${statusVal==='published' ? (t('common.update')||'Update') : (t('help.publish')||'Publish')}</button>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <!-- Modals -->
    <div id="wp-modal" class="wp-modal" hidden>
      <div class="wp-modal-box" id="wp-modal-box"></div>
    </div>
    `;
  }

  function openModal(html){
    const modal = $('#wp-modal');
    const box = $('#wp-modal-box');
    if(!modal||!box) return;
    box.innerHTML = html;
    modal.hidden = false;
    modal.addEventListener('click', function handler(e){
      if(e.target===modal){ closeModal(); modal.removeEventListener('click', handler); }
    });
    const closeBtn = box.querySelector('[data-close-modal]');
    if(closeBtn) closeBtn.addEventListener('click', closeModal);
  }
  function closeModal(){
    const modal = $('#wp-modal');
    if(modal) modal.hidden = true;
  }

  function bindWP(articleData){
    const canvas = $('#ed-canvas');
    if(!canvas) return;

    // Title -> slug auto + header title sync + word count
    const titleInput = $('#ed-title');
    const slugInput = $('#ed-slug');
    const slugInput2 = $('#ed-slug2');
    const slugPreview = $('#wp-slug-preview');
    const slugPreview2 = $('#wp-slug-preview2');
    const titleDisplay = $('#wp-title-display');

    function syncTitle(){
      const title = titleInput.value.trim();
      if(titleDisplay) titleDisplay.textContent = title ? title.slice(0,32) : (t('help.newArticle')||'New Article');
      if(!slugInput.value.trim() || slugInput.dataset.auto !== '0'){
        const s = slugify(title);
        slugInput.value = s;
        slugInput2.value = s;
        if(slugPreview) slugPreview.textContent = s || 'your-title';
        if(slugPreview2) slugPreview2.textContent = s || '—';
      } else {
        if(slugPreview) slugPreview.textContent = slugInput.value || 'your-title';
        if(slugPreview2) slugPreview2.textContent = slugInput.value || '—';
      }
      document.title = (title ? title + ' — ' : '') + (t('help.editorTitle')||'Edit Article');
      markDirty();
    }
    titleInput?.addEventListener('input', syncTitle);
    titleInput?.addEventListener('input', updateWordCount);

    function syncSlug(e){
      const v = e.target.value.trim() || slugify($('#ed-title').value);
      if(slugPreview) slugPreview.textContent = v;
      if(slugPreview2) slugPreview2.textContent = v;
      // sync both inputs
      if(e.target.id==='ed-slug') $('#ed-slug2').value = e.target.value;
      else $('#ed-slug').value = e.target.value;
      e.target.dataset.auto='0';
      markDirty();
    }
    slugInput?.addEventListener('input', syncSlug);
    slugInput2?.addEventListener('input', syncSlug);
    $('#wp-edit-slug-btn')?.addEventListener('click', ()=>{
      const el = $('#wp-slug-edit');
      if(el) el.hidden = !el.hidden;
      if(!el.hidden) $('#ed-slug')?.focus();
    });
    $('#wp-slug-save')?.addEventListener('click', ()=>{
      $('#wp-slug-edit').hidden=true;
    });

    // Word count initial
    updateWordCount();
    canvas.addEventListener('input', ()=>{ markDirty(); updateWordCount(); });
    canvas.addEventListener('keyup', updateWordCount);
    $('#ed-summary')?.addEventListener('input', ()=>{ markDirty(); const c=$('#wp-excerpt-count'); if(c) c.textContent = String($('#ed-summary').value.length); });
    // cat search
    $('#wp-cat-search')?.addEventListener('input', (e)=>{
      const q = e.target.value.toLowerCase().trim();
      $$('#ed-cats .wp-cat-item').forEach(label=>{
        const txt = label.textContent.toLowerCase();
        label.style.display = txt.includes(q) ? '' : 'none';
      });
    });
    // sidebar toggle
    $('#wp-settings-toggle')?.addEventListener('click', ()=>{
      const sb = $('#wp-sidebar');
      if(sb) sb.classList.toggle('is-hidden');
    });
    // fullscreen
    $('#wp-fullscreen')?.addEventListener('click', ()=>{
      document.documentElement.classList.toggle('wp-fullscreen');
      if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
      else document.documentElement.requestFullscreen().catch(()=>{});
    });

    // Block heading dropdown
    $('#tb-block')?.addEventListener('change', (e)=>{
      const v = e.target.value;
      if(!v) return;
      if(v==='p') exec('formatBlock','<p>');
      else if(v==='pre') insertHTML('<pre><code>code here</code></pre>');
      else if(v==='blockquote') exec('formatBlock','<blockquote>');
      else exec('formatBlock', `<${v}>`);
      e.target.value='p';
    });
    // font, size, colors
    $$('#ed-toolbar [data-cmd]').forEach(b=> b.addEventListener('click', ()=> {
      saveSelection();
      exec(b.dataset.cmd);
    }));
    $('#tb-font')?.addEventListener('change', e=> { if(e.target.value){ saveSelection(); exec('fontName', e.target.value); }});
    $('#tb-size')?.addEventListener('change', e=> {
      if(!e.target.value) return;
      saveSelection();
      exec('fontSize','7');
      const fonts = canvas.querySelectorAll('font[size="7"]');
      fonts.forEach(f=> { f.removeAttribute('size'); f.style.fontSize = e.target.value; });
      markDirty();
    });
    $('#tb-color')?.addEventListener('input', e=> { saveSelection(); exec('foreColor', e.target.value); });
    $('#tb-hilite')?.addEventListener('input', e=> { saveSelection(); exec('hiliteColor', e.target.value); });
    $('#tb-ltr')?.addEventListener('click', ()=> { canvas.dir='ltr'; canvas.style.direction='ltr'; markDirty(); });
    $('#tb-rtl')?.addEventListener('click', ()=> { canvas.dir='rtl'; canvas.style.direction='rtl'; markDirty(); });
    $('#tb-indent')?.addEventListener('click', ()=> exec('indent'));
    $('#tb-outdent')?.addEventListener('click', ()=> exec('outdent'));

    // Link modal
    $('#tb-link')?.addEventListener('click', ()=>{
      saveSelection();
      openModal(`<h3>${t('help.insertLink')||'Insert link'}</h3>
        <label>URL <input id="wp-link-url" type="url" placeholder="https://example.com" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:block">Text <input id="wp-link-text" type="text" placeholder="Link text" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="wp-link-blank" checked /> Open in new tab</label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-link-insert">Insert</button></div>`);
      $('#wp-link-insert')?.addEventListener('click', ()=>{
        const url = $('#wp-link-url').value.trim();
        const txt = $('#wp-link-text').value.trim();
        const blank = $('#wp-link-blank').checked;
        if(!url) return closeModal();
        let html = '';
        if(window.getSelection()?.toString()){
          // wrap selection
          exec('createLink', url);
          // add target
          setTimeout(()=>{
            const links = canvas.querySelectorAll('a[href="'+CSS.escape(url)+'"]');
            links.forEach(a=>{ if(blank){ a.target='_blank'; a.rel='noopener'; }});
          },10);
        } else {
          html = `<a href="${esc(url)}" ${blank?'target="_blank" rel="noopener"':''}>${esc(txt||url)}</a>`;
          insertHTML(html);
        }
        closeModal();
      });
      // prefill selected text
      const selText = window.getSelection()?.toString()||'';
      if(selText) $('#wp-link-text').value = selText;
    });

    // Image
    function handleImageInsert(url, alt, caption, width){
      let html = `<figure style="margin:14px 0;text-align:center"><img src="${esc(url)}" alt="${esc(alt)}" style="max-width:100%;border-radius:12px;${width? 'width:'+esc(width)+';':''}" />`;
      if(caption) html += `<figcaption style="color:var(--muted);font-size:13px;margin-top:6px">${esc(caption)}</figcaption>`;
      html += `</figure>`;
      insertHTML(html);
    }
    $('#tb-image')?.addEventListener('click', ()=>{
      saveSelection();
      openModal(`<h3>${t('help.insertImage')||'Insert image'}</h3>
        <div class="wp-tabs" style="display:flex;gap:8px;margin:10px 0">
          <button type="button" class="btn btn-sm btn-ghost active" data-img-tab="url">URL</button>
          <button type="button" class="btn btn-sm btn-ghost" data-img-tab="upload">Upload</button>
        </div>
        <div id="wp-img-url-pane">
          <label>Image URL <input id="wp-img-url" type="url" placeholder="https://.../image.jpg" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        </div>
        <div id="wp-img-upload-pane" hidden>
          <label>Choose file <input id="wp-img-file" type="file" accept="image/*" style="width:100%;margin-top:6px" /></label>
          <div id="wp-img-preview" style="margin-top:10px;max-height:160px;overflow:auto"></div>
        </div>
        <label style="margin-top:10px;display:block">Alt text <input id="wp-img-alt" type="text" placeholder="Describe image…" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:block">Caption (optional) <input id="wp-img-caption" type="text" placeholder="Caption under image" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:block">Width <select id="wp-img-width" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)"><option value="">Auto</option><option value="100%">Full width</option><option value="50%">Half</option><option value="320px">320px</option></select></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-img-insert">Insert</button></div>`);
      // tab switch
      $$('[data-img-tab]').forEach(btn=> btn.addEventListener('click', ()=>{
        $$('[data-img-tab]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const tab=btn.dataset.imgTab;
        $('#wp-img-url-pane').hidden = tab!=='url';
        $('#wp-img-upload-pane').hidden = tab!=='upload';
      }));
      let selectedFileDataUrl = '';
      $('#wp-img-file')?.addEventListener('change', (e)=>{
        const file = e.target.files?.[0];
        if(!file) return;
        if(file.size> 8*1024*1024){ toast('File too large (>8MB)'); return; }
        const reader = new FileReader();
        reader.onload = ()=>{
          selectedFileDataUrl = reader.result;
          $('#wp-img-preview').innerHTML = `<img src="${esc(selectedFileDataUrl)}" style="max-width:100%;border-radius:8px;max-height:140px" />`;
        };
        reader.readAsDataURL(file);
      });
      $('#wp-img-insert')?.addEventListener('click', ()=>{
        const url = selectedFileDataUrl || $('#wp-img-url').value.trim();
        const alt = $('#wp-img-alt').value.trim();
        const caption = $('#wp-img-caption').value.trim();
        const width = $('#wp-img-width').value;
        if(!url){ toast(t('help.needImageUrl')||'Image URL required'); return; }
        handleImageInsert(url, alt, caption, width);
        closeModal();
      });
    });
    // Gallery (multiple images)
    $('#tb-gallery')?.addEventListener('click', ()=>{
      saveSelection();
      openModal(`<h3>${t('help.insertGallery')||'Insert gallery'}</h3>
        <label>Image URLs (one per line) <textarea id="wp-gallery-urls" rows="4" placeholder="https://.../1.jpg&#10;https://.../2.jpg" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)"></textarea></label>
        <label style="margin-top:10px;display:block">Or choose files <input id="wp-gallery-files" type="file" accept="image/*" multiple /></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-gallery-insert">Insert</button></div>`);
      $('#wp-gallery-insert')?.addEventListener('click', async()=>{
        const urls = $('#wp-gallery-urls').value.split('\n').map(s=> s.trim()).filter(Boolean);
        let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:14px 0">`;
        for(const u of urls) html += `<img src="${esc(u)}" style="width:100%;border-radius:10px;aspect-ratio:4/3;object-fit:cover" />`;
        html += `</div>`;
        // files?
        const files = $('#wp-gallery-files').files;
        if(files && files.length){
          for(const file of files){
            const dataUrl = await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
            html = html.replace('</div>', `<img src="${esc(dataUrl)}" style="width:100%;border-radius:10px;aspect-ratio:4/3;object-fit:cover" /></div>`);
          }
        }
        if(urls.length || (files && files.length)) insertHTML(html);
        closeModal();
      });
    });

    // Video
    $('#tb-video')?.addEventListener('click', ()=>{
      saveSelection();
      openModal(`<h3>${t('help.insertVideo')||'Insert video / embed'}</h3>
        <label>Video URL (YouTube/Vimeo/mp4) <input id="wp-video-url" type="url" placeholder="https://youtube.com/watch?v=... or mp4 url" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-video-insert">Insert</button></div>`);
      $('#wp-video-insert')?.addEventListener('click', ()=>{
        const url = $('#wp-video-url').value.trim();
        if(!url) return closeModal();
        let embed='';
        if(url.includes('youtube.com')||url.includes('youtu.be')){
          let id='';
          try{ const u=new URL(url); id=u.searchParams.get('v')|| u.pathname.slice(1); if(id.includes('/')) id=id.split('/').pop(); }catch{}
          if(id) embed=`<figure style="margin:14px 0"><iframe src="https://www.youtube.com/embed/${esc(id)}" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:12px;border:0"></iframe></figure>`;
        } else if(url.includes('vimeo.com')){
          const id=url.split('/').pop();
          embed=`<figure style="margin:14px 0"><iframe src="https://player.vimeo.com/video/${esc(id)}" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:12px;border:0"></iframe></figure>`;
        } else {
          embed=`<video controls src="${esc(url)}" style="max-width:100%;border-radius:12px;display:block;margin:14px 0"></video>`;
        }
        if(embed) insertHTML(embed);
        closeModal();
      });
    });

    // Table
    $('#tb-table')?.addEventListener('click', ()=>{
      saveSelection();
      openModal(`<h3>${t('help.insertTable')||'Insert table'}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label>Rows <input id="wp-table-rows" type="number" min="1" max="20" value="3" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
          <label>Columns <input id="wp-table-cols" type="number" min="1" max="10" value="3" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        </div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="wp-table-head" checked /> ${t('help.tableHeader')||'Header row'}</label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-table-insert">Insert</button></div>`);
      $('#wp-table-insert')?.addEventListener('click', ()=>{
        const rows = Math.max(1, Math.min(20, Number($('#wp-table-rows').value)||3));
        const cols = Math.max(1, Math.min(10, Number($('#wp-table-cols').value)||3));
        const head = $('#wp-table-head').checked;
        let html = `<table style="width:100%;border-collapse:collapse;margin:14px 0">`;
        for(let r=0;r<rows;r++){
          html+='<tr>';
          for(let c=0;c<cols;c++){
            const tag = (r===0 && head) ? 'th' : 'td';
            const style = 'border:1px solid var(--help-line);padding:8px;text-align:start';
            html+=`<${tag} style="${style}">${r===0&&head? 'Header': 'Cell'}</${tag}>`;
          }
          html+='</tr>';
        }
        html+='</table>';
        insertHTML(html);
        closeModal();
      });
    });

    // Button
    $('#tb-button')?.addEventListener('click', ()=>{
      saveSelection();
      openModal(`<h3>${t('help.insertButton')||'Insert button'}</h3>
        <label>Text <input id="wp-btn-text" type="text" value="Click here" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:block">URL <input id="wp-btn-url" type="url" placeholder="https://..." style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:block">Style <select id="wp-btn-style" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)"><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="ghost">Ghost</option></select></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-btn-insert">Insert</button></div>`);
      $('#wp-btn-insert')?.addEventListener('click', ()=>{
        const txt=$('#wp-btn-text').value.trim()||'Button';
        const url=$('#wp-btn-url').value.trim()||'#';
        const style=$('#wp-btn-style').value;
        const cls = style==='primary' ? 'btn btn-primary' : style==='secondary' ? 'btn btn-secondary' : 'btn btn-ghost';
        const html=`<p style="margin:14px 0"><a href="${esc(url)}" class="${cls}" style="display:inline-block;padding:10px 18px;border-radius:999px;text-decoration:none">${esc(txt)}</a></p>`;
        insertHTML(html);
        closeModal();
      });
    });

    $('#tb-hr')?.addEventListener('click', ()=> insertHTML('<hr style="margin:16px 0;border:0;border-top:1px solid var(--help-line)" />'));
    $('#tb-code')?.addEventListener('click', ()=> insertHTML('<pre style="background:#08131e;border:1px solid var(--help-line);border-radius:10px;padding:12px;overflow:auto"><code>code here</code></pre>'));

    // Block inserter menu
    $('#wp-add-block')?.addEventListener('click', ()=>{
      const menu=$('#wp-block-menu');
      if(menu) menu.hidden = !menu.hidden;
    });
    $$('#wp-block-menu [data-block]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const block=btn.dataset.block;
        $('#wp-block-menu').hidden=true;
        switch(block){
          case 'paragraph': insertHTML('<p>New paragraph — اكتب هنا</p>'); break;
          case 'h2': insertHTML('<h2>Heading — عنوان</h2>'); break;
          case 'list': insertHTML('<ul><li>First item</li><li>Second</li></ul>'); break;
          case 'quote': insertHTML('<blockquote>اقتباس ملهم — Inspiring quote</blockquote>'); break;
          case 'image': $('#tb-image').click(); break;
          case 'gallery': $('#tb-gallery').click(); break;
          case 'video': $('#tb-video').click(); break;
          case 'table': $('#tb-table').click(); break;
          case 'code': insertHTML('<pre><code>code here</code></pre>'); break;
          case 'separator': insertHTML('<hr />'); break;
          case 'button': $('#tb-button').click(); break;
          case 'embed': $('#tb-link').click(); break;
          default: insertHTML('<p>Block</p>');
        }
      });
    });

    // Tabs edit/code/preview
    $$('.wp-editor-header [data-wp-tab], .wp-tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        $$('.wp-tab').forEach(b=> b.classList.remove('active'));
        btn.classList.add('active');
        const tab=btn.dataset.wpTab || btn.dataset.tab;
        // also sync header tabs
        $$('.wp-tab').forEach(b=> { if((b.dataset.wpTab||b.dataset.tab)===tab) b.classList.add('active'); });
        $('#tab-visual').hidden = tab!=='edit';
        $('#tab-code').hidden = tab!=='code';
        $('#tab-preview').hidden = tab!=='preview';
        $('.wp-toolbar').hidden = tab!=='edit';
        if(tab==='preview'){
          const html=canvas.innerHTML;
          const css=$('#ed-css')?.value || $('#ed-css-panel')?.value || '';
          $('#ed-preview').innerHTML = (css? `<style>${css}</style>` : '') + html;
        }
        if(tab==='code'){
          if(!$('#ed-html').value.trim()) $('#ed-html').value = canvas.innerHTML;
          if(!$('#ed-css').value.trim() && $('#ed-css-panel').value.trim()) $('#ed-css').value = $('#ed-css-panel').value;
        }
      });
    });
    // sync code area css panel <-> code tab css
    $('#ed-css-panel')?.addEventListener('input', (e)=>{ const c=$('#ed-css'); if(c) c.value=e.target.value; });
    $('#btn-apply-code')?.addEventListener('click', ()=>{
      const html=$('#ed-html').value;
      if(html.trim()) canvas.innerHTML = html;
      const css=$('#ed-css').value;
      if($('#ed-css-panel')) $('#ed-css-panel').value = css;
      toast(t('help.applied')||'Applied');
      markDirty();
    });
    $('#btn-extract-code')?.addEventListener('click', ()=>{
      $('#ed-html').value = canvas.innerHTML;
      $('#ed-css').value = $('#ed-css-panel').value || '';
      toast(t('help.extracted')||'Extracted');
    });

    // drag drop
    canvas.addEventListener('dragover', e=>{ e.preventDefault(); canvas.style.outline='2px dashed var(--cyan)'; });
    canvas.addEventListener('dragleave', ()=>{ canvas.style.outline=''; });
    canvas.addEventListener('drop', async (e)=>{
      e.preventDefault(); canvas.style.outline='';
      const files=[...e.dataTransfer.files].filter(f=> f.type.startsWith('image/'));
      for(const file of files){
        const dataUrl = await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
        handleImageInsert(dataUrl, file.name, '', '');
      }
    });
    // paste image
    canvas.addEventListener('paste', async (e)=>{
      const items=[...e.clipboardData.items].filter(i=> i.type.startsWith('image/'));
      for(const item of items){
        e.preventDefault();
        const file=item.getAsFile();
        const dataUrl = await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
        handleImageInsert(dataUrl, 'pasted', '', '');
      }
    });
    // featured image helper
    $('#wp-set-featured')?.addEventListener('click', ()=>{
      openModal(`<h3>${t('help.setFeatured')||'Featured image'}</h3>
        <label>Image URL <input id="wp-feat-url" type="url" placeholder="https://..." style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--help-line);background:var(--input-bg);color:var(--text)" /></label>
        <label style="margin-top:10px;display:block">Or upload <input id="wp-feat-file" type="file" accept="image/*" /></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.cancel')||'Cancel'}</button><button class="btn btn-sm btn-primary" id="wp-feat-insert">Use</button></div>`);
      $('#wp-feat-insert')?.addEventListener('click', async()=>{
        let url=$('#wp-feat-url').value.trim();
        const file=$('#wp-feat-file').files?.[0];
        if(file){
          url = await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
        }
        if(!url) return closeModal();
        handleImageInsert(url, '', '', '100%');
        closeModal();
      });
    });

    // autosave indicator sync
    setInterval(updateWordCount, 2000);

    // keyboard shortcuts: Ctrl+B/I/K/Z/Y
    canvas.addEventListener('keydown', (e)=>{
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='b'){ e.preventDefault(); exec('bold'); }
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='i'){ e.preventDefault(); exec('italic'); }
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); $('#tb-link').click(); }
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); exec('undo'); }
      if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))){ e.preventDefault(); exec('redo'); }
      if(e.key==='/'){ /* could trigger block inserter */ }
    });
  }

  async function saveArticle(publish=false){
    if(saveLock) return null;
    saveLock = true;
    const titleEl = $('#ed-title');
    const slugEl = $('#ed-slug');
    const slugEl2 = $('#ed-slug2');
    const langEl = $('#ed-lang');
    const countryEl = $('#ed-country');
    const sumEl = $('#ed-summary');
    const statusEl = $('#ed-status');
    const canvas = $('#ed-canvas');
    const htmlArea = $('#ed-html');
    const cssArea = $('#ed-css');
    const cssPanel = $('#ed-css-panel');

    let title = titleEl.value.trim();
    if(!title){ toast(t('help.needTitle')||'Title required'); titleEl.focus(); saveLock=false; return null; }
    let slug = (slugEl.value.trim() || slugEl2.value.trim() || slugify(title));
    const language = langEl.value;
    const country = countryEl.value;
    let status = publish ? 'published' : (statusEl.value || 'draft');
    let content_html = canvas.innerHTML.trim();
    if(htmlArea && htmlArea.value.trim() && !$('#tab-code').hidden){
      content_html = htmlArea.value.trim();
      canvas.innerHTML = content_html;
    }
    const content_css = (cssPanel?.value || cssArea?.value || '').trim();
    const summary = sumEl.value.trim();
    const checkedCats = [...document.querySelectorAll('#ed-cats input[name="cats"]:checked')].map(i=> Number(i.value));
    if(!checkedCats.length){ toast(t('help.needCategory')||'Pick at least one category'); saveLock=false; return null; }
    const primaryCat = checkedCats[0];
    const payload = {
      slug, title, summary, content_html, content_css, language, country, status,
      category_id: primaryCat,
      reading_minutes: readingMinutes(content_html),
    };
    // keep author
    const sess = getSession();
    if(sess){
      payload.author_id = String(sess.member_id||'');
      payload.author_name = String(sess.username||'');
    }
    if(status==='published') payload.published_at = new Date().toISOString();

    let res;
    try{
      if(articleId){
        res = await supabaseRequest(`/rest/v1/help_articles?id=eq.${articleId}`, {method:'PATCH', body: JSON.stringify(payload)});
        if(!res.ok) throw new Error(JSON.stringify(res.data));
      } else {
        res = await supabaseRequest('/rest/v1/help_articles', {method:'POST', body: JSON.stringify(payload)});
        if(!res.ok) throw new Error(JSON.stringify(res.data));
        const created = Array.isArray(res.data) ? res.data[0] : res.data;
        if(created && created.id) articleId = created.id;
        if(articleId) history.replaceState({}, '', `Article.html?id=${articleId}`);
      }
      if(articleId){
        await supabaseRequest(`/rest/v1/help_article_categories?article_id=eq.${articleId}`, {method:'DELETE'});
        for(const cid of checkedCats){
          await supabaseRequest('/rest/v1/help_article_categories', {method:'POST', body: JSON.stringify({article_id: articleId, category_id: cid})});
        }
      }
      lastSavedAt = new Date();
      const saveState = $('#ed-save-state');
      if(saveState) saveState.textContent = publish ? (t('help.published')||'Published ✓') + ' · ' + lastSavedAt.toLocaleTimeString() : (t('help.saved')||'Saved') + ' · ' + lastSavedAt.toLocaleTimeString();
      const msgEl = $('#wp-status-msg') || $('#ed-status-msg');
      if(msgEl) msgEl.textContent = publish ? (t('help.published')||'Published') : (t('help.saved')||'Saved');
      toast(publish ? (t('help.published')||'Published') : (t('help.saved')||'Saved'));
      setTimeout(()=> { if(msgEl) msgEl.textContent=''; }, 2500);
      isDirty = false;
      saveLock=false;
      return articleId;
    } catch(e){
      console.error(e);
      toast(t('help.saveFailed')||'Save failed. Run sql/help.sql');
      const saveState = $('#ed-save-state');
      if(saveState) saveState.textContent = t('help.error')||'Error saving';
      saveLock=false;
      return null;
    }
  }

  function setupAutosave(){
    const autosaveEl = $('#ed-autosave');
    if(!autosaveEl) return;
    const markDirty = ()=> { isDirty=true; const el=$('#ed-save-state'); if(el) el.textContent = '• '+(t('help.unsaved')||'Unsaved'); };
    ['input','keyup','paste','change'].forEach(ev=> {
      const c = $('#ed-canvas'); if(c) c.addEventListener(ev, markDirty);
    });
    $('#ed-title')?.addEventListener('input', markDirty);
    $('#ed-summary')?.addEventListener('input', markDirty);
    $('#ed-cats')?.addEventListener('change', markDirty);
    autosaveTimer = setInterval(async()=>{
      if(autosaveEl.checked && isDirty && !saveLock){
        const prevStatus = $('#ed-status').value;
        $('#ed-status').value = 'draft';
        await saveArticle(false);
        if(prevStatus==='published'){
          // optionally revert? keep draft for autosave like WP
        }
      }
    }, 4000);
    // before unload warning
    window.addEventListener('beforeunload', (e)=>{
      if(isDirty){ e.preventDefault(); e.returnValue=''; }
    });
  }

  async function init(){
    articleId = qId();
    const cats = await fetchCategories();
    let data=null, extra=[];
    if(articleId){
      data = await fetchArticle(articleId);
      if(data) extra = await fetchArticleCats(articleId);
      else articleId=null;
    }
    $('#editor-root').innerHTML = renderEditor(cats, data, extra);
    // fill code areas
    if(data){
      const htmlArea=$('#ed-html');
      const cssArea=$('#ed-css');
      const cssPanel=$('#ed-css-panel');
      if(htmlArea) htmlArea.value = data.content_html||'';
      if(cssArea) cssArea.value = data.content_css||'';
      if(cssPanel) cssPanel.value = data.content_css||'';
      if($('#ed-summary')) $('#wp-excerpt-count').textContent = String(($('#ed-summary').value||'').length);
    }
    bindWP(data);
    setupAutosave();
    // buttons
    $('#btn-save')?.addEventListener('click', ()=> saveArticle(false));
    $('#btn-save-2')?.addEventListener('click', ()=> saveArticle(false));
    $('#btn-publish')?.addEventListener('click', ()=> saveArticle(true));
    $('#btn-publish-2')?.addEventListener('click', ()=> saveArticle(true));
    $('#wp-preview-btn')?.addEventListener('click', ()=>{
      const html=$('#ed-canvas').innerHTML;
      const css=$('#ed-css-panel')?.value || $('#ed-css')?.value || '';
      openModal(`<h3>${t('help.preview')||'Preview'}</h3><div style="max-height:70vh;overflow:auto;border:1px solid var(--help-line);border-radius:12px;padding:16px;background:#fff;color:#111">${css? `<style>${css}</style>`: ''}${html}</div><div style="text-align:end;margin-top:10px"><button class="btn btn-sm btn-ghost" data-close-modal>${t('common.close')||'Close'}</button></div>`);
    });
    if(window.CineAura && window.CineAura.translateDom) window.CineAura.translateDom(document);
    // focus
    if(!data) $('#ed-title')?.focus();
    updateWordCount();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
