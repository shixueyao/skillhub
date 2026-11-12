/* ============================================================================
 * SkillHub 局域网定制层（运行时注入，不改动官方前端构建产物）
 *
 * 由 nginx sub_filter 注入到所有 text/html 页面。负责：
 *   1. 顶部导航新增「DSH 插件市场」「首页管理」（桌面 + 移动下拉）
 *   2. 控制台管理员侧边栏新增「首页内容」入口
 *   3. 首页读取 /site/content/home.json，渲染公告、覆盖 Hero 文案、追加信息卡片
 *   4. 全站加载 /site/plugin-market.js：点顶部「DSH 插件市场」直接在首页展开
 *      面板（不再生成第二行标签），提供分类、搜索与需登录的发布 / 版本管理
 *   5. 网站登录态显隐（由同源 /site/site-auth.js 提供）：未登录隐藏「首页管理」；
 *      在官方发布页 /dashboard/publish 注入「技能 Skill / DSH 插件」类型切换条
 *
 * 设计原则：幂等、可降级、不阻塞。配置读取失败时仍会注入导航，
 * 首页定制区块则整体跳过，官方页面保持原样。
 * 登录只在服务端（nginx auth_request）强制校验，前端判断仅用于界面显隐。
 * ========================================================================== */
(function () {
  'use strict';

  var CONFIG_URL = '/site/content/home.json';
  // Legacy static portal. A deployment running the native plugin-hosting UI
  // overrides this through home.json's nav.dshPluginsHref.
  var DSH_HREF = '/dsh-plugins/';

  // 插件门户与站点管理页本身不需要注入逻辑
  var path = window.location.pathname;
  if (/^\/(dsh-plugins|site)(\/|$)/.test(path)) return;

  var FALLBACK = {
    enabled: false,
    nav: { dshPlugins: 'DSH 插件市场', admin: '首页内容' }
  };
  var config = FALLBACK;

  /* ---------------------------------------------------------------- 样式 */
  var css = '' +
    '.site-injected-block{box-sizing:border-box;width:100%;font-family:inherit}' +
    '.site-wrap{max-width:1200px;margin:0 auto;padding:0 24px}' +
    '.site-notice{padding:11px 0;font-size:14px;line-height:1.6;text-align:center;' +
      'border-bottom:1px solid hsl(var(--border,220 13% 91%));' +
      'background:hsl(var(--card,0 0% 100%));color:hsl(var(--foreground,222 47% 11%))}' +
    '.site-notice[data-level="warn"]{background:#fff7e6;color:#7a4b00;border-color:#f0d9a8}' +
    '.site-notice[data-level="success"]{background:#eefaf1;color:#1c6b3a;border-color:#c6e9d2}' +
    '.site-notice[data-level="danger"]{background:#fff1f1;color:#9b2727;border-color:#f2cccc}' +
    '.site-cards{padding:8px 0 56px}' +
    '.site-cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:20px}' +
    '.site-card{display:flex;flex-direction:column;padding:22px;border-radius:14px;' +
      'border:1px solid hsl(var(--border,220 13% 91%));' +
      'background:hsl(var(--card,0 0% 100%));color:hsl(var(--card-foreground,222 47% 11%));' +
      'box-shadow:0 1px 2px rgba(0,0,0,.04)}' +
    '.site-card h3{margin:0 0 10px;font-size:17px;font-weight:600}' +
    '.site-card p{margin:0 0 16px;font-size:14px;line-height:1.7;opacity:.72;flex:1}' +
    '.site-card a{font-size:14px;font-weight:600;color:hsl(var(--primary,221 83% 53%));text-decoration:none}' +
    '.site-card a:hover{text-decoration:underline}' +
    '.site-card a[aria-disabled="true"]{opacity:.45;pointer-events:none}' +
    '.site-section-title{margin:0;font-size:22px;font-weight:600;' +
      'color:hsl(var(--foreground,222 47% 11%))}' +
    '.site-footer-note{padding:0 0 24px;font-size:13px;opacity:.65;text-align:center;' +
      'color:hsl(var(--muted-foreground,215 16% 47%))}' +
    /* 官方发布页的「技能 / DSH 插件」类型切换条 */
    '.site-publish-entry{padding:11px 0;border-bottom:1px solid hsl(var(--border,220 13% 91%));' +
      'background:#f7faff;color:hsl(var(--foreground,222 47% 11%))}' +
    '.site-publish-entry .site-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:9px;font-size:13px}' +
    '.site-publish-entry strong{font-weight:650;margin-right:2px}' +
    '.site-publish-entry .sep{opacity:.4}' +
    '.site-publish-entry a{font-weight:600;text-decoration:none;padding:5px 13px;border-radius:999px;' +
      'border:1px solid #e3e7ec;background:#fff;color:hsl(var(--foreground,222 47% 11%));white-space:nowrap}' +
    '.site-publish-entry a:hover{opacity:.86}' +
    '.site-publish-entry a.active{background:#2563eb;border-color:#2563eb;color:#fff}' +
    '.site-publish-entry .tip{font-size:12.5px;color:hsl(var(--muted-foreground,215 16% 47%))}' +
    '@media(max-width:640px){.site-wrap{padding:0 16px}.site-cards{padding-bottom:36px}}';

  function ensureStyles() {
    if (document.getElementById('site-inject-styles')) return;
    var style = document.createElement('style');
    style.id = 'site-inject-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------- 工具 */
  function text(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : (fallback || '');
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof content === 'string') node.textContent = content;
    return node;
  }

  function isHomePage() {
    var p = window.location.pathname;
    return p === '/' || p === '' || p === '/index.html';
  }

  function navConfig(key, fallback) {
    return (config && config.nav && typeof config.nav[key] === 'string' && config.nav[key].trim())
      ? config.nav[key].trim()
      : fallback;
  }
  function dshHref() { return navConfig('dshPluginsHref', DSH_HREF); }
  function publishPluginHref() { return navConfig('publishPluginHref', '/#dsh-plugins'); }

  function siteAuth() { return window.SiteAuth || null; }
  function isSiteLoggedIn() {
    var sa = siteAuth();
    return !!(sa && sa.user());
  }
  function isPublishPage() {
    return /^\/dashboard\/publish\/?$/.test(window.location.pathname);
  }

  /* ---------------------------------------------- 网站登录态有关的界面显隐 */
  // 「首页管理」是写操作入口，未登录时隐藏；已登录后自动出现。
  function applyAuthVisibility() {
    var sa = siteAuth();
    var current = sa && sa.user();
    var isSuperAdmin = !!(current && Array.isArray(current.platformRoles)
      && current.platformRoles.indexOf('SUPER_ADMIN') >= 0);
    var want = isSuperAdmin ? '' : 'none';
    var links = document.querySelectorAll('a[data-site-nav="admin"],a[data-site-sidebar="1"]');
    for (var i = 0; i < links.length; i++) {
      // 只在值变化时写 DOM，避免 MutationObserver -> apply -> 再写 的死循环
      if (links[i].style.display !== want) links[i].style.display = want;
    }
  }

  // 官方技能发布页顶部加一条类型切换：技能 Skill（当前页）/ DSH 插件（插件市场）。
  // 点击后写入会话标记，plugin-market.js 展开面板时会直接打开发布表单。
  function renderPublishEntry() {
    var key = 'publish-entry';
    var existing = document.querySelector('[data-site-block="' + key + '"]');
    if (!isPublishPage() || !isSiteLoggedIn()) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    if (existing) return;   // 幂等：React 重渲染时不重复插入

    var box = el('div', 'site-injected-block site-publish-entry');
    box.setAttribute('data-site-block', key);
    var wrap = el('div', 'site-wrap');
    wrap.appendChild(el('strong', '', '发布内容'));
    wrap.appendChild(el('span', 'sep', '|'));
    var skill = el('a', 'active', '技能 Skill');
    skill.setAttribute('href', '/dashboard/publish');
    var dsh = el('a', '', 'DSH 插件');
    dsh.setAttribute('href', publishPluginHref());
    dsh.setAttribute('data-pm-keep', '1');
    dsh.addEventListener('click', function () {
      try { sessionStorage.setItem('skillhub.lan.openPublish', 'dsh'); } catch (e) { /* ignore */ }
    });
    wrap.appendChild(skill);
    wrap.appendChild(dsh);
    wrap.appendChild(el('span', 'tip', '两类内容都使用当前网站登录账号，无需额外口令'));
    box.appendChild(wrap);

    var header = document.querySelector('header');
    if (header && header.parentNode) header.parentNode.insertBefore(box, header.nextSibling);
    else if (document.body) document.body.insertBefore(box, document.body.firstChild);
  }

  /* ---------------------------------------------------------------- 顶部导航 */
  function injectNav() {
    var labels = (config && config.nav) || FALLBACK.nav;
    var navs = document.querySelectorAll('nav');
    for (var i = 0; i < navs.length; i++) {
      var nav = navs[i];
      var anchors = nav.querySelectorAll('a');
      if (!anchors.length) continue;

      // 只处理主导航：链接指向站内主要路由
      var isMainNav = false;
      for (var j = 0; j < anchors.length; j++) {
        var href = anchors[j].getAttribute('href') || '';
        if (href === '/' || href === '/search' || href.indexOf('/dashboard') === 0) {
          isMainNav = true;
          break;
        }
      }
      if (!isMainNav) continue;

      var mobile = /flex-col/.test(nav.className || '');
      var baseClass = mobile
        ? 'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-foreground'
        : 'px-4 py-1.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity duration-150';

      var hideDshNav = !!(config && config.nav && config.nav.dshPluginsHide === true);
      if (hideDshNav) {
        var legacyDsh = nav.querySelector('a[data-site-nav="dsh"]');
        if (legacyDsh && legacyDsh.parentNode) legacyDsh.parentNode.removeChild(legacyDsh);
      } else {
        addNavLink(nav, 'dsh', dshHref(), text(labels.dshPlugins, 'DSH 插件市场'), baseClass, mobile);
      }
    }
  }

  function addNavLink(nav, key, href, label, baseClass, mobile) {
    var existing = nav.querySelector('a[data-site-nav="' + key + '"]');
    if (existing) {
      if (existing.textContent !== label) existing.textContent = label;
      return;
    }
    var a = el('a', baseClass, label);
    a.setAttribute('href', href);
    a.setAttribute('data-site-nav', key);
    a.setAttribute('data-analytics-id', 'navigation.site.' + key + '.open');
    if (!mobile) a.style.color = 'hsl(var(--foreground) / 0.65)';
    nav.appendChild(a);
  }

  /* ------------------------------------------------- 控制台侧边栏（管理员） */
  /* ---------------------------------------------------------------- 首页内容 */
  function removeBlock(key) {
    var old = document.querySelector('[data-site-block="' + key + '"]');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function clearHomeBlocks() {
    ['notice', 'cards', 'footer'].forEach(removeBlock);
  }

  function syncBlock(key, signature, build, mount) {
    var current = document.querySelector('[data-site-block="' + key + '"]');
    if (current && current.getAttribute('data-sig') === signature) return;
    removeBlock(key);
    var node = build();
    node.setAttribute('data-site-block', key);
    node.setAttribute('data-sig', signature);
    mount(node);
  }

  // 只改第一个文本节点，保留按钮里的 svg 图标等子元素；
  // 同时记住官方原文，保证「留空」或关闭自定义时能够还原。
  function firstTextNode(node) {
    if (!node) return null;
    for (var i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === 3) return node.childNodes[i];
    }
    return null;
  }

  function syncText(node, value) {
    if (!node) return;
    if (!node.hasAttribute('data-site-hero-orig')) {
      var first = firstTextNode(node);
      node.setAttribute('data-site-hero-orig', first ? (first.nodeValue || '') : '');
    }
    var desired = text(value, node.getAttribute('data-site-hero-orig'));
    var tn = firstTextNode(node);
    if (tn) {
      if (tn.nodeValue !== desired) tn.nodeValue = desired;
    } else if (desired) {
      node.appendChild(document.createTextNode(desired));
    }
  }

  function applyHero(hero) {
    var h1 = document.querySelector('main h1');
    if (!h1) return;
    syncText(h1, hero.title);
    var para = h1.parentElement ? h1.parentElement.querySelector('p') : null;
    syncText(para, hero.description);
    var primary = h1.parentElement ? h1.parentElement.querySelector('a') : null;
    syncText(primary, hero.primaryButtonText);
    if (primary && text(hero.primaryButtonUrl)) primary.setAttribute('href', hero.primaryButtonUrl);
  }

  function renderHome() {
    // The React portal owns the homepage when homeManagedByApp is enabled; do not
    // mutate its DOM from the legacy overlay.
    if ((config && (config.homeManagedByApp === true || Number(config.version) >= 2))
      || document.querySelector('[data-portal-home]')) {
      clearHomeBlocks();
      return;
    }
    var active = isHomePage() && config && config.enabled !== false;
    if (!active) {
      clearHomeBlocks();
      applyHero({});
      return;
    }

    var cfg = config;
    var notice = cfg.notice || {};
    if (notice.enabled && text(notice.text)) {
      var sig = 'notice|' + notice.level + '|' + notice.text;
      syncBlock('notice', sig, function () {
        var box = el('div', 'site-injected-block site-notice');
        box.setAttribute('data-level', text(notice.level, 'info'));
        box.appendChild(el('div', 'site-wrap', notice.text));
        return box;
      }, function (node) {
        var header = document.querySelector('header');
        if (header && header.parentNode) header.parentNode.insertBefore(node, header.nextSibling);
        else document.body.insertBefore(node, document.body.firstChild);
      });
    } else {
      removeBlock('notice');
    }

    // Hero 文案覆盖：留空表示沿用官方 i18n 文案；关闭自定义时自动还原
    applyHero(cfg.hero || {});

    var cards = Array.isArray(cfg.cards) ? cfg.cards.filter(function (c) {
      return c && text(c.title);
    }) : [];
    if (cards.length) {
      var cardsSig = 'cards|' + JSON.stringify(cards);
      syncBlock('cards', cardsSig, function () {
        var section = el('section', 'site-injected-block site-cards');
        var wrap = el('div', 'site-wrap');
        wrap.appendChild(el('h2', 'site-section-title', text(cfg.cardsTitle, '站点导航')));
        var grid = el('div', 'site-cards-grid');
        cards.forEach(function (card) {
          var box = el('div', 'site-card');
          box.appendChild(el('h3', '', card.title));
          box.appendChild(el('p', '', text(card.body)));
          var linkText = text(card.linkText, '查看详情 →');
          var link = el('a', '', linkText);
          var url = text(card.linkUrl);
          if (url) link.setAttribute('href', url);
          else link.setAttribute('aria-disabled', 'true');
          box.appendChild(link);
          grid.appendChild(box);
        });
        wrap.appendChild(grid);
        section.appendChild(wrap);
        return section;
      }, function (node) {
        var main = document.querySelector('main');
        var footer = document.querySelector('footer');
        if (main && main.parentNode) main.parentNode.insertBefore(node, main.nextSibling);
        else if (footer && footer.parentNode) footer.parentNode.insertBefore(node, footer);
        else document.body.appendChild(node);
      });
    } else {
      removeBlock('cards');
    }

    var note = text(cfg.footerNote);
    if (note) {
      syncBlock('footer', 'footer|' + note, function () {
        var box = el('div', 'site-injected-block site-footer-note');
        box.appendChild(el('div', 'site-wrap', note));
        return box;
      }, function (node) {
        var footer = document.querySelector('footer');
        if (footer && footer.parentNode) footer.parentNode.insertBefore(node, footer.nextSibling);
        else document.body.appendChild(node);
      });
    } else {
      removeBlock('footer');
    }
  }

  /* ------------------------------------------------- 插件市场标签页（全站加载）
   * 脚本必须在非首页也运行：否则从 /search、/dashboard 等页点顶部导航时，
   * 没有事件拦截就会跳到独立门户页。脚本内部 sync() 会按路径决定是否渲染标签。 */
  function loadPluginMarket() {
    if (document.getElementById('site-plugin-market-js')) return;
    var s = document.createElement('script');
    s.id = 'site-plugin-market-js';
    s.src = '/site/plugin-market.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- 调度 */
  var applying = false;
  function apply() {
    if (applying) return;
    applying = true;
    try {
      ensureStyles();
      injectNav();
      applyAuthVisibility();
      renderHome();
      renderPublishEntry();
      loadPluginMarket();
      if (window.__sitePluginMarketSync) window.__sitePluginMarketSync();
    } catch (err) {
      if (window.console && console.warn) console.warn('[site-inject]', err);
    } finally {
      applying = false;
    }
  }

  // 登录 / 登出是 SPA 内跳转，不会重新执行本脚本；官方 React bundle 可能在
  // 我们包装 history API 之前就缓存了原始引用，因此不能只依赖 pushState 钩子。
  // 策略：路由变化(hashchange/popstate/history)强制复核 + 任意 DOM 变化时
  // 节流复核（3s）+ 页面重新可见时强制复核。refresh 只在登录态变化时广播。
  var lastAuthCheck = 0;
  function recheckAuth(force) {
    var sa = siteAuth();
    if (!sa) return;
    var now = Date.now();
    if (!force && now - lastAuthCheck < 3000) return;
    lastAuthCheck = now;
    sa.refresh(true);
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; apply(); }, 120);
    recheckAuth();
  }

  function onRouteChange() {
    schedule();
    recheckAuth(true);
  }

  function loadConfig() {
    return fetch(CONFIG_URL, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (data) {
        config = (data && typeof data === 'object') ? data : FALLBACK;
        schedule();
      })
      .catch(function () {
        config = FALLBACK;
        schedule();
      });
  }

  // SPA 路由变化：包装 history API + 兜底 DOM 观察
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function () {
      var result = original.apply(this, arguments);
      onRouteChange();
      return result;
    };
  });
  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('hashchange', onRouteChange);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { loadConfig(); recheckAuth(true); }
  });

  if (document.body) {
    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      var observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      apply();
    });
  }

  // 网站登录态变化时重新调度一次（显示/隐藏管理入口与发布类型条）。
  // 首次主动探测；plugin-market.js 也会调用同一个 refresh()，内部会复用请求。
  if (siteAuth()) {
    siteAuth().onChange(schedule);
    siteAuth().refresh();
  }

  loadConfig();
  apply();
})();
