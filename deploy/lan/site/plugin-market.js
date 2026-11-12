/* ============================================================================
 * DSH 插件市场（首页内面板，由顶部导航直接打开）+ Web 端发布与版本管理
 *
 * 由 /site/inject.js 全站注入加载。全部逻辑在浏览器内完成，通过 nginx
 * 内置 DAV 提供的受保护 PUT/DELETE 写入宿主机 bind mount 目录，无需重建镜像、
 * 无需新增后端服务。写入的 index.json 结构与 scripts/plugin-repo.py 完全一致，
 * 因此命令行 publish / list / verify / activate / yank / remove 依旧可用。
 *
 * 交互约定：
 *   - 顶部导航「DSH 插件市场」是唯一入口，点击直接展开本面板（不再自建标签行）；
 *     面板内「← 返回首页」或再次点击导航可收起，#dsh-plugins 可直达。
 *   - 只读浏览无需登录；发布、编辑信息、设为推荐、下架、删除统一使用
 *     SkillHub 网站登录态（SESSION cookie），不再有 siteadmin 独立口令。
 *     前端用 /site/site-auth.js 判断显隐，nginx 用 auth_request 复核会话。
 *   - 登录后「+ 发布」表单顶部可选择发布「DSH 插件」或「技能 Skill」，
 *     后者直接调用官方 /api/web/skills/{namespace}/publish 接口。
 *   - 像 skill 包一样支持分类、标签、关键字搜索、排序与版本管理。
 * ========================================================================== */
(function () {
  'use strict';

  var INDEX_URL = '/dsh-plugins/index.json';
  var VERSIONS_URL = '/dsh-plugins/versions/';
  var HASH = '#dsh-plugins';
  var SKILL_NAMESPACES_URL = '/api/web/me/namespaces';
  var SKILL_PREVIEW_URL = '/api/web/skills/package-preview';
  var SKILL_PUBLISH_URL = '/api/web/skills/';
  var FULL_PUBLISH_URL = '/dashboard/publish';
  var PUBLISH_FLAG = 'skillhub.lan.openPublish';
  var FALLBACK_CATEGORIES = ['官方插件', '技能管理', '开发工具', '集成扩展', '其他'];

  /* ------------------------------------------------------------------ 样式 */
  var css = [
    /* 顶部导航激活态：替代原来的第二行标签，避免重复 */
    'a[data-site-nav="dsh"][data-site-active="1"]{',
      'color:hsl(var(--primary,221 83% 53%))!important;font-weight:700;',
      'background:rgba(37,99,235,.1)!important;border-radius:999px}',
    'body.pm-active main,body.pm-active .site-injected-block,',
      'body.pm-active footer{display:none!important}',
    '.pm-panel{box-sizing:border-box;max-width:1200px;margin:22px auto 56px;',
      'padding:22px 24px 30px;border:1px solid #e3e7ec;border-radius:12px;',
      'background:#fff;color:#1c2430;',
      'font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}',
    '.pm-panel *{box-sizing:border-box}',
    '.pm-top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;',
      'justify-content:space-between;margin-bottom:16px}',
    '.pm-top h2{margin:0;font-size:20px;font-weight:650}',
    '.pm-top .pm-sub{margin:3px 0 0;color:#6b7480;font-size:12.5px}',
    '.pm-tools{display:flex;gap:8px;flex-wrap:wrap}',
    '.pm-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;',
      'padding:7px 13px;border:1px solid #e3e7ec;border-radius:8px;background:#fff;',
      'color:#1c2430;font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
      'transition:.15s;text-decoration:none}',
    '.pm-btn:hover{border-color:#b9c3d0;background:#fbfcfe}',
    '.pm-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}',
    '.pm-btn.primary:hover{background:#1d4fd8}',
    '.pm-btn.danger{color:#b91c1c}',
    '.pm-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.pm-mini{padding:3px 9px;border:1px solid #e3e7ec;border-radius:6px;background:#fff;',
      'color:#6b7480;font:inherit;font-size:12px;cursor:pointer}',
    '.pm-mini:hover{color:#1c2430;border-color:#b9c3d0}',
    '.pm-mini.del:hover{color:#b91c1c;border-color:#e8b4b4}',
    /* 登录条 */
    '.pm-auth{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:11px 14px;',
      'margin-bottom:14px;border:1px solid #e3e7ec;border-radius:9px;',
      'background:#f8fafc;font-size:12.5px}',
    '.pm-auth.locked{border-color:#f0d9a8;background:#fffbf2}',
    '.pm-auth.unlocked{border-color:#c6e9d2;background:#f2fbf5}',
    '.pm-auth input{width:200px;padding:6px 9px;border:1px solid #e3e7ec;',
      'border-radius:7px;font:inherit;font-size:13px;outline:none}',
    '.pm-auth input:focus{border-color:#2563eb;box-shadow:0 0 0 3px #eaf1ff}',
    '.pm-lock{font-weight:650;color:#7a4b00}',
    '.pm-ok{font-weight:650;color:#15803d}',
    '.pm-hint{color:#6b7480}',
    '.pm-status{margin-left:auto;font-weight:600}',
    '.pm-status.ok{color:#15803d}.pm-status.err{color:#b91c1c}.pm-status.warn{color:#b45309}',
    /* 发布类型切换：DSH 插件 / 技能 Skill */
    '.pm-types{display:flex;flex-wrap:wrap;align-items:center;gap:8px;',
      'margin:2px 0 16px;padding-bottom:14px;border-bottom:1px solid #e3e7ec}',
    '.pm-types > span.pm-types-label{font-size:12.5px;color:#6b7480;font-weight:600;margin-right:2px}',
    '.pm-type-btn{padding:7px 16px;border:1px solid #e3e7ec;border-radius:999px;',
      'background:#fff;color:#1c2430;font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
      'transition:.15s}',
    '.pm-type-btn:hover{border-color:#b9c3d0;background:#fbfcfe}',
    '.pm-type-btn.active{background:#2563eb;border-color:#2563eb;color:#fff}',
    '.pm-type-tip{flex:1;min-width:190px;font-size:12px;color:#6b7480}',
    '.pm-link{color:#2563eb;font-weight:600;text-decoration:none;font-size:12.5px}',
    '.pm-link:hover{text-decoration:underline}',
    '.pm-skill-note{padding:10px 12px;border-radius:8px;background:#f1f6ff;',
      'color:#254a8a;font-size:12.5px;margin:0 0 14px}',
    '.pm-field select{width:100%;padding:8px 10px;border:1px solid #e3e7ec;',
      'border-radius:7px;background:#fff;font:inherit;font-size:13px;color:#1c2430;outline:none}',
    '.pm-field select:focus{border-color:#2563eb;box-shadow:0 0 0 3px #eaf1ff}',
    /* 分类 / 搜索 / 排序 */
    '.pm-filter{display:flex;flex-wrap:wrap;gap:9px;align-items:center;padding:12px 14px;',
      'margin-bottom:8px;border:1px solid #e3e7ec;border-radius:9px;background:#fcfdff}',
    '.pm-filter input[type=search],.pm-filter select{padding:7px 10px;',
      'border:1px solid #e3e7ec;border-radius:7px;font:inherit;font-size:13px;',
      'background:#fff;color:#1c2430;outline:none}',
    '.pm-filter input[type=search]{flex:1;min-width:210px}',
    '.pm-filter input:focus,.pm-filter select:focus{border-color:#2563eb;',
      'box-shadow:0 0 0 3px #eaf1ff}',
    '.pm-filter label{display:inline-flex;align-items:center;gap:6px;',
      'font-size:12.5px;color:#6b7480}',
    '.pm-meta{padding:2px 2px 14px;font-size:12.5px;color:#6b7480}',
    /* 插件卡片 */
    '.pm-plugin{border:1px solid #e3e7ec;border-radius:11px;padding:18px 20px;margin-bottom:16px}',
    '.pm-plugin h3{margin:0 0 6px;font-size:16px;font-weight:650;word-break:break-all}',
    '.pm-plugin .pm-desc{margin:6px 0 12px;color:#6b7480;font-size:13px}',
    '.pm-badge{display:inline-block;padding:2px 9px;border-radius:999px;background:#eaf1ff;',
      'color:#2563eb;font-size:11.5px;font-weight:600;margin-left:8px;vertical-align:2px}',
    '.pm-badge.rec{background:#e8f7ee;color:#15803d}',
    '.pm-badge.cat{background:#f1eeff;color:#6d47d9}',
    '.pm-badge.yank{background:#fff1f1;color:#b91c1c}',
    '.pm-tag{display:inline-block;padding:1px 8px;margin:0 5px 4px 0;border-radius:999px;',
      'background:#f1f4f8;color:#5b6775;font-size:11.5px}',
    '.pm-table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:12px}',
    '.pm-table th{text-align:left;padding:8px 10px;background:#f6f8fa;color:#6b7480;',
      'font-weight:600;border-bottom:1px solid #e3e7ec;white-space:nowrap}',
    '.pm-table td{padding:10px;border-bottom:1px solid #f0f2f5;vertical-align:top}',
    '.pm-table tr:last-child td{border-bottom:none}',
    '.pm-table .pm-ops{white-space:nowrap}',
    '.pm-table code,.pm-code{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;',
      'background:#f3f5f8;padding:2px 5px;border-radius:4px;word-break:break-all}',
    '.pm-cmd{padding:8px 10px 12px!important;background:#fbfcfe}',
    '.pm-cmd .pm-code{display:inline-block;max-width:82%;padding:6px 9px;margin-right:8px}',
    '.pm-empty{padding:34px 12px;text-align:center;color:#6b7480}',
    /* 表单 */
    '.pm-form{border:1px solid #cddcf7;border-radius:11px;padding:20px;margin-bottom:18px;',
      'background:#fbfdff}',
    '.pm-form h3{margin:0 0 4px;font-size:16px;word-break:break-all}',
    '.pm-form .pm-sub{margin:0 0 16px;color:#6b7480;font-size:12.5px}',
    '.pm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}',
    '.pm-field{display:block;font-size:13px;font-weight:600}',
    '.pm-field > span{display:block;margin-bottom:5px}',
    '.pm-field > small{display:block;margin-top:4px;color:#6b7480;font-weight:400;font-size:11.5px}',
    '.pm-field input[type=text],.pm-field textarea,.pm-field input[type=file]{width:100%;',
      'padding:8px 10px;border:1px solid #e3e7ec;border-radius:7px;background:#fff;',
      'font:inherit;font-size:13px;outline:none}',
    '.pm-field input:focus,.pm-field textarea:focus{border-color:#2563eb;',
      'box-shadow:0 0 0 3px #eaf1ff}',
    '.pm-field textarea{resize:vertical;min-height:60px}',
    '.pm-checks{display:flex;flex-wrap:wrap;gap:18px;margin:14px 0;font-size:13px}',
    '.pm-checks label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}',
    '.pm-checks input{accent-color:#2563eb}',
    '.pm-actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:6px}',
    '.pm-parsed{padding:9px 12px;border-radius:8px;background:#eef7f1;color:#16653a;',
      'font-size:12.5px;margin-bottom:14px}',
    '.pm-parsed.warn{background:#fff7e6;color:#7a4b00}',
    '@media(max-width:760px){.pm-grid{grid-template-columns:1fr}',
      '.pm-panel{padding:16px 12px 26px;margin:14px 10px 36px}',
      '.pm-table{font-size:12px}.pm-table .pm-ops{white-space:normal}}'
  ].join('');

  function ensureStyles() {
    if (document.getElementById('pm-styles')) return;
    var s = document.createElement('style');
    s.id = 'pm-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ 工具 */
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (typeof txt === 'string') n.textContent = txt;
    return n;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isHome() {
    var p = window.location.pathname;
    return p === '/' || p === '' || p === '/index.html';
  }
  function fmtSize(n) {
    if (!n && n !== 0) return '—';
    return n < 1024 ? n + ' B' : n < 1048576
      ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  }
  function fmtDate(s) { return s ? String(s).replace('T', ' ').replace('Z', '') : '—'; }
  function nowIso() { return new Date().toISOString().slice(0, 19) + 'Z'; }
  function txt(v, fallback) { return typeof v === 'string' && v.trim() ? v : (fallback || ''); }
  function baseUrl(index) {
    return txt(index && index.skillhubBaseUrl, window.location.origin).replace(/\/$/, '');
  }
  function safeSlug(name) {
    return (String(name).replace(/\//g, '-').replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plugin');
  }
  function versionKey(v) {
    var m = /^(\d+)\.(\d+)\.(\d+)(?:[-.](.+))?$/.exec(v || '');
    if (!m) return [0, 0, 0, 0, String(v)];
    return [+m[1], +m[2], +m[3], m[4] ? 0 : 1, m[4] || ''];
  }
  function cmpVersion(a, b) {
    var x = versionKey(a), y = versionKey(b);
    for (var i = 0; i < 5; i++) { if (x[i] > y[i]) return 1; if (x[i] < y[i]) return -1; }
    return 0;
  }
  function parseTags(value) {
    return String(value || '').split(/[,，;；]/).map(function (t) { return t.trim(); })
      .filter(function (t, i, all) { return t && all.indexOf(t) === i; });
  }
  function categoriesOf(index) {
    var out = [];
    var seeds = (index && index.categories) || FALLBACK_CATEGORIES;
    seeds.forEach(function (c) { if (c && out.indexOf(c) < 0) out.push(c); });
    var plugins = (index && index.plugins) || {};
    Object.keys(plugins).forEach(function (n) {
      var c = plugins[n] && plugins[n].category;
      if (c && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  function lastPublished(pkg) {
    var latest = '';
    (pkg.versions || []).forEach(function (v) {
      var t = String(v.publishedAt || '');
      if (t > latest) latest = t;
    });
    return latest;
  }
  function status(msg, kind) {
    var box = document.getElementById('pm-status');
    if (!box) return;
    box.textContent = msg || '';
    box.className = 'pm-status' + (kind ? ' ' + kind : '');
  }
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(t);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('浏览器拒绝了复制'));
    });
  }

  /* ------------------------------------------------------- 纯 JS SHA-256
   * 内网是 HTTP（非安全上下文），crypto.subtle 不可用，因此自带实现，
   * 保证在 http://192.168.x.x 下也能生成与 CLI 一致的校验和。            */
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Hex(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var total = Math.ceil((len + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var dv = new DataView(buf.buffer);
    var bits = len * 8;
    dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(total - 4, bits >>> 0);
    var w = new Int32Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < total; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var a15 = w[i - 15], a2 = w[i - 2];
        var s0 = rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3);
        var s1 = rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3];
      var e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) {
      return ('00000000' + (x >>> 0).toString(16)).slice(-8);
    }).join('');
  }

  /* ------------------------------------------- tgz 解析（gzip + tar header）
   * 与 SkillHub 上传 skill 包时自动读取包内元数据保持一致。               */
  function gunzip(buffer) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('浏览器不支持解压，请手动填写包名与版本'));
    }
    var ds = new DecompressionStream('gzip');
    var stream = new Blob([buffer]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function tarStr(u8, off, len) {
    var out = '';
    for (var i = 0; i < len && off + i < u8.length; i++) {
      var c = u8[off + i];
      if (!c) break;
      out += String.fromCharCode(c);
    }
    return out;
  }
  function tarFile(u8, wanted) {
    for (var off = 0; off + 512 <= u8.length;) {
      var name = tarStr(u8, off, 100);
      if (!name) break;
      var size = parseInt(tarStr(u8, off + 124, 12).trim(), 8) || 0;
      var prefix = tarStr(u8, off + 345, 155);
      var full = prefix ? prefix + '/' + name : name;
      if (full === wanted || full === './' + wanted) {
        return new TextDecoder('utf-8').decode(u8.subarray(off + 512, off + 512 + size));
      }
      off += 512 + Math.ceil(size / 512) * 512;
    }
    return null;
  }
  function readManifest(file) {
    return file.arrayBuffer().then(function (b) {
      return gunzip(b);
    }).then(function (u8) {
      var raw = tarFile(u8, 'package/package.json');
      if (!raw) throw new Error('包内未找到 package/package.json');
      var manifest = JSON.parse(raw);
      if (!manifest.name || !manifest.version) {
        throw new Error('package.json 缺少 name 或 version');
      }
      return manifest;
    });
  }

  /* ------------------------------------------------------------ 请求封装
   * 写操作不再携带任何口令：浏览器同源请求自动带 HttpOnly 的 SESSION cookie，
   * nginx 的 auth_request 会向 Java 后端复核网站会话。前端只负责界面显隐。 */
  function siteAuth() { return window.SiteAuth || null; }

  function request(url, opt) {
    opt = opt || {};
    return fetch(url, {
      method: opt.method || 'GET',
      headers: opt.headers || {},
      body: opt.body,
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        onSessionLost();
        throw new Error('网站登录已失效，请重新登录（HTTP ' + r.status + '）');
      }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
      return r;
    });
  }
  function fetchIndex() {
    return fetch(INDEX_URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('读取插件清单失败 HTTP ' + r.status); return r.json(); });
  }
  function putIndex(index) {
    index.updatedAt = nowIso();
    return request(INDEX_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(index, null, 2) + '\n'
    });
  }
  function putFile(filename, body) {
    return request(VERSIONS_URL + encodeURIComponent(filename), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: body
    });
  }
  function deleteFile(filename) {
    return request(VERSIONS_URL + encodeURIComponent(filename), { method: 'DELETE' });
  }

  /* -------------------------------------------------------------- 页面骨架 */
  var panel = null, indexData = null, active = false;
  var loggedIn = false, currentUser = null, sessionChecked = false;
  var publishType = 'dsh';          // 'dsh' | 'skill'
  var skillNamespaces = null, skillPreview = null;
  var filter = { q: '', category: '', sort: 'recommended' };

  function place(node, anchor) {
    if (!anchor || !anchor.parentNode) return;
    if (anchor.nextSibling !== node) anchor.parentNode.insertBefore(node, anchor.nextSibling);
  }
  function panelAnchor() {
    return document.querySelector('main') || document.querySelector('footer');
  }
  function setBodyActive(on) {
    if (!document.body) return;
    var has = document.body.classList.contains('pm-active');
    if (on && !has) document.body.classList.add('pm-active');
    else if (!on && has) document.body.classList.remove('pm-active');
  }
  // 顶部导航高亮即「当前所在标签」，不再生成第二行标签栏。
  // 只在状态变化时改 DOM，避免触发 inject.js 的 MutationObserver 死循环。
  function syncNavState() {
    var links = document.querySelectorAll('a[data-site-nav="dsh"]');
    var want = active && isHome();
    for (var i = 0; i < links.length; i++) {
      var has = links[i].hasAttribute('data-site-active');
      if (want && !has) links[i].setAttribute('data-site-active', '1');
      else if (!want && has) links[i].removeAttribute('data-site-active');
    }
  }
  function ensurePanel() {
    ensureStyles();
    if (!panel || !panel.isConnected) {
      panel = el('section', 'pm-panel');
      panel.setAttribute('data-pm', 'panel');
      panel.id = 'pm-panel';
      var anchor = panelAnchor();
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
      else document.body.appendChild(panel);
      renderPanel();
    } else {
      place(panel, panelAnchor());
    }
  }

  function setActive(on, keepHash) {
    active = !!on && isHome();
    if (!document.body) return;
    ensurePanel();
    setBodyActive(active);
    var wantDisplay = active ? '' : 'none';
    if (panel.style.display !== wantDisplay) panel.style.display = wantDisplay;
    syncNavState();
    if (!keepHash) {
      if (active && window.location.hash !== HASH) history.replaceState(null, '', HASH);
      if (!active && window.location.hash === HASH) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
    if (active) refreshList();
  }

  /* ---------------------------------------------------------------- 渲染 */
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = '';

    var top = el('div', 'pm-top');
    var left = el('div');
    left.appendChild(el('h2', '', 'DSH 插件市场'));
    left.appendChild(el('p', 'pm-sub',
      '像 skill 包一样管理：分类、搜索、版本、校验与回滚 · 网站登录后可直接发布 DSH 插件或技能'));
    top.appendChild(left);

    var tools = el('div', 'pm-tools');
    var btnBack = el('button', 'pm-btn', '← 返回首页');
    btnBack.type = 'button'; btnBack.id = 'pm-btn-back';
    var btnRefresh = el('button', 'pm-btn', '刷新');
    btnRefresh.type = 'button'; btnRefresh.id = 'pm-btn-refresh';
    var btnPortal = el('a', 'pm-btn', '独立门户页');
    btnPortal.href = '/dsh-plugins/';
    btnPortal.target = '_blank';
    btnPortal.rel = 'noopener';
    btnPortal.setAttribute('data-pm-keep', '1');
    var btnPublish = el('button', 'pm-btn primary', '+ 发布');
    btnPublish.type = 'button'; btnPublish.id = 'pm-btn-publish';
    btnPublish.title = '发布 DSH 插件或技能 Skill 包（需登录网站）';
    btnPublish.style.display = loggedIn ? '' : 'none';
    tools.appendChild(btnBack);
    tools.appendChild(btnRefresh);
    tools.appendChild(btnPortal);
    tools.appendChild(btnPublish);
    top.appendChild(tools);
    panel.appendChild(top);

    var auth = el('div', 'pm-auth');
    auth.id = 'pm-auth';
    panel.appendChild(auth);

    var bar = el('div', 'pm-filter');
    bar.id = 'pm-filter';
    bar.innerHTML = [
      '<input type="search" id="pm-q" autocomplete="off"',
      ' placeholder="搜索插件名 / 描述 / 分类 / 标签 / 版本 / 说明…">',
      '<label>分类 <select id="pm-category"><option value="">全部</option></select></label>',
      '<label>排序 <select id="pm-sort">',
      '<option value="recommended">推荐优先</option>',
      '<option value="name">名称 A→Z</option>',
      '<option value="updated">最近发布</option>',
      '<option value="versions">版本最多</option>',
      '</select></label>'
    ].join('');
    panel.appendChild(bar);

    var meta = el('div', 'pm-meta');
    meta.id = 'pm-meta';
    panel.appendChild(meta);

    var formHost = el('div');
    formHost.id = 'pm-form-host';
    panel.appendChild(formHost);

    var listHost = el('div');
    listHost.id = 'pm-list';
    listHost.appendChild(el('div', 'pm-empty', '正在读取插件清单…'));
    panel.appendChild(listHost);

    btnBack.addEventListener('click', function () { setActive(false); });
    btnRefresh.addEventListener('click', function () { refreshList(); });
    btnPublish.addEventListener('click', function () { showForm(!document.getElementById('pm-form')); });
    document.getElementById('pm-q').addEventListener('input', function (e) {
      filter.q = e.target.value; renderList(indexData);
    });
    document.getElementById('pm-category').addEventListener('change', function (e) {
      filter.category = e.target.value; renderList(indexData);
    });
    document.getElementById('pm-sort').addEventListener('change', function (e) {
      filter.sort = e.target.value; renderList(indexData);
    });

    applyAuthState();
  }

  /* ------------------------------------------------------- 网站登录态显隐
   * 没有任何独立口令：登录状态完全来自 /site/site-auth.js（GET /api/v1/auth/me）。
   * 真正的写权限由 nginx auth_request 在服务端强制校验。 */
  function renderAuth() {
    var host = document.getElementById('pm-auth');
    if (!host) return;
    host.innerHTML = '';
    host.className = 'pm-auth ' + (loggedIn ? 'unlocked' : 'locked');
    if (loggedIn) {
      var sa = siteAuth();
      host.appendChild(el('span', 'pm-ok',
        '✓ 已登录网站：' + (sa ? sa.displayName(currentUser) : '已登录')));
      host.appendChild(el('span', 'pm-hint',
        '可以发布 DSH 插件或技能包，编辑分类 / 标签，以及管理版本'));
      var again = el('button', 'pm-btn', '刷新登录态');
      again.type = 'button'; again.id = 'pm-btn-refresh-login';
      again.addEventListener('click', function () {
        status('正在复核网站登录态…', 'warn');
        siteAuth().refresh(true).then(function (u) {
          status(u ? '登录态有效' : '登录已失效，请重新登录', u ? 'ok' : 'warn');
        });
      });
      host.appendChild(again);
    } else {
      host.appendChild(el('span', 'pm-lock', '🔒 发布与管理需要登录 SkillHub 网站'));
      var login = el('button', 'pm-btn primary', '去登录');
      login.type = 'button'; login.id = 'pm-btn-login';
      login.addEventListener('click', goLogin);
      host.appendChild(login);
      host.appendChild(el('span', 'pm-hint',
        '使用网站账号（与顶部「发布」相同），无需额外口令；只读浏览与复制安装命令无需登录'));
    }
    var st = el('span', 'pm-status', '');
    st.id = 'pm-status';
    host.appendChild(st);
  }

  function goLogin() {
    var target = '/' + HASH;
    var sa = siteAuth();
    if (sa) sa.goLogin(target);
    else window.location.href = '/login?returnTo=' + encodeURIComponent(target);
  }

  function applyAuthState() {
    renderAuth();
    var btn = document.getElementById('pm-btn-publish');
    if (btn) btn.style.display = loggedIn ? '' : 'none';
    if (!loggedIn) showForm(false);
    if (indexData) renderList(indexData); else refreshList();
  }

  // 写请求被 auth_request 拒绝时立即把界面退回只读，避免出现「假登录」
  function onSessionLost() {
    if (!loggedIn) return;
    loggedIn = false;
    currentUser = null;
    applyAuthState();
    status('网站登录已失效，请点击「去登录」重新登录', 'err');
  }

  // 首次 / 重新获得焦点时向后端复核会话；结果通过 SiteAuth.onChange 回到 UI
  function refreshLogin(force) {
    var sa = siteAuth();
    if (!sa) return;
    if (sessionChecked && !force) return;
    sessionChecked = true;
    sa.refresh(force);
  }

  // 官方发布页「DSH 插件」切换按钮留下的会话标记：回到首页后直接打开发布表单
  var publishFlagConsumed = false;
  function consumePublishFlag() {
    if (publishFlagConsumed || !loggedIn) return;
    var flag = '';
    try {
      flag = sessionStorage.getItem(PUBLISH_FLAG) || '';
      if (flag) sessionStorage.removeItem(PUBLISH_FLAG);
    } catch (e) { return; }
    if (!flag || !isHome()) return;
    publishFlagConsumed = true;
    setActive(true);
    showForm(true, flag === 'skill' ? 'skill' : 'dsh');
    status('已进入发布页面，可切换「DSH 插件」或「技能 Skill」', 'ok');
  }

  function bindSiteAuth() {
    var sa = siteAuth();
    if (!sa) return;
    sa.onChange(function (u) {
      currentUser = u || null;
      var next = !!u;
      if (next !== loggedIn) {
        loggedIn = next;
        applyAuthState();
      }
      if (loggedIn) consumePublishFlag();
    });
    refreshLogin(true);
  }

  /* ------------------------------------------------- 分类 / 搜索 / 列表渲染 */
  function refreshFilterOptions(index) {
    var sel = document.getElementById('pm-category');
    if (!sel || !index) return;
    var plugins = index.plugins || {};
    var counts = {};
    Object.keys(plugins).forEach(function (n) {
      var c = txt(plugins[n].category, '未分类');
      counts[c] = (counts[c] || 0) + 1;
    });
    var html = '<option value="">全部分类 (' + Object.keys(plugins).length + ')</option>';
    categoriesOf(index).forEach(function (c) {
      html += '<option value="' + esc(c) + '">' + esc(c) + ' (' + (counts[c] || 0) + ')</option>';
    });
    if (counts['未分类']) {
      html += '<option value="__none__">未分类 (' + counts['未分类'] + ')</option>';
    }
    sel.innerHTML = html;
    sel.value = filter.category;
  }

  function matches(name, pkg, q, category) {
    var cat = txt(pkg.category);
    if (category === '__none__' && cat) return false;
    if (category && category !== '__none__' && cat !== category) return false;
    if (!q) return true;
    var parts = [name, txt(pkg.description), cat, txt(pkg.license),
                 (pkg.tags || []).join(' ')];
    (pkg.versions || []).forEach(function (v) {
      parts.push(v.version, v.notes, v.compatNote);
      parts.push(((v.package || {}).dsh || []).join(' '));
    });
    return parts.join(' ').toLowerCase().indexOf(q) !== -1;
  }

  function actionBtn(label, kind, name, version) {
    var b = el('button', 'pm-mini', label);
    b.type = 'button';
    b.addEventListener('click', function () { doAction(kind, name, version); });
    return b;
  }

  function renderList(index) {
    var host = document.getElementById('pm-list');
    if (!host) return;
    host.innerHTML = '';
    if (!index) { host.appendChild(el('div', 'pm-empty', '清单尚未加载')); return; }
    indexData = index;
    refreshFilterOptions(index);

    var plugins = index.plugins || {};
    var all = Object.keys(plugins);
    var q = filter.q.trim().toLowerCase();
    var names = all.filter(function (n) { return matches(n, plugins[n], q, filter.category); });
    names.sort(function (a, b) {
      var pa = plugins[a], pb = plugins[b];
      if (filter.sort === 'name') return a.localeCompare(b);
      if (filter.sort === 'versions') {
        return (pb.versions || []).length - (pa.versions || []).length || a.localeCompare(b);
      }
      if (filter.sort === 'updated') {
        return lastPublished(pb).localeCompare(lastPublished(pa)) || a.localeCompare(b);
      }
      if (a === index.recommended) return -1;
      if (b === index.recommended) return 1;
      return a.localeCompare(b);
    });

    var totalVersions = 0, catCount = {};
    all.forEach(function (n) {
      totalVersions += (plugins[n].versions || []).length;
      var c = txt(plugins[n].category, '未分类');
      catCount[c] = (catCount[c] || 0) + 1;
    });
    var catText = Object.keys(catCount).map(function (c) {
      return c + ' ' + catCount[c];
    }).join(' · ');
    var meta = document.getElementById('pm-meta');
    if (meta) {
      meta.textContent = '共 ' + all.length + ' 个插件 / ' + totalVersions + ' 个版本' +
        (catText ? ' · 分类：' + catText : '') + ' · 当前显示 ' + names.length + ' 个';
    }

    if (!all.length) {
      host.appendChild(el('div', 'pm-empty', loggedIn
        ? '仓库中还没有插件，点右上角「+ 发布」上传第一个 .tgz 包，或选择发布技能。'
        : '仓库中还没有插件。发布内容需要先登录 SkillHub 网站。'));
      return;
    }
    if (!names.length) {
      host.appendChild(el('div', 'pm-empty', '没有匹配的插件，试试其它关键字或分类。'));
      var clear = el('button', 'pm-btn', '清除筛选');
      clear.type = 'button';
      clear.addEventListener('click', function () {
        filter.q = ''; filter.category = ''; filter.sort = 'recommended';
        var box = document.getElementById('pm-q'); if (box) box.value = '';
        var sort = document.getElementById('pm-sort'); if (sort) sort.value = 'recommended';
        renderList(indexData);
      });
      var wrap = el('div', 'pm-empty');
      wrap.appendChild(clear);
      host.appendChild(wrap);
      return;
    }

    var url = baseUrl(index);
    names.forEach(function (name) {
      var pkg = plugins[name];
      var box = el('div', 'pm-plugin');
      var h = el('h3', '', name);
      if (index.recommended === name) h.appendChild(el('span', 'pm-badge rec', '推荐插件'));
      h.appendChild(el('span', 'pm-badge cat', txt(pkg.category, '未分类')));
      box.appendChild(h);

      var tags = pkg.tags || [];
      if (tags.length) {
        var tagLine = el('div');
        tags.forEach(function (t) { tagLine.appendChild(el('span', 'pm-tag', t)); });
        box.appendChild(tagLine);
      }
      box.appendChild(el('p', 'pm-desc', txt(pkg.description, '暂无描述') +
        (pkg.license ? ' · ' + pkg.license : '') + ' · 推荐版本 ' + txt(pkg.latest, '未设置')));

      if (loggedIn) {
        var edit = el('button', 'pm-mini', '编辑分类 / 标签 / 简介');
        edit.type = 'button';
        edit.addEventListener('click', function () { showMetaForm(name); });
        box.appendChild(edit);
      }

      var table = el('table', 'pm-table');
      table.innerHTML = '<thead><tr><th>版本</th><th>状态</th><th>大小</th><th>发布时间</th>' +
        '<th>SHA-256</th><th>' + (loggedIn ? '操作' : '操作（需登录网站）') + '</th></tr></thead>';
      var tbody = el('tbody');
      var versions = (pkg.versions || []).slice().sort(function (a, b) {
        return cmpVersion(b.version, a.version);
      });
      versions.forEach(function (v) {
        var tr = el('tr');
        tr.appendChild(el('td', '', v.version));
        var state = el('td');
        state.appendChild(el('span',
          'pm-badge' + (v.yanked ? ' yank' : (v.version === pkg.latest ? ' rec' : '')),
          v.yanked ? '已下架' : (v.version === pkg.latest ? '当前推荐' : '已发布')));
        tr.appendChild(state);
        tr.appendChild(el('td', '', fmtSize(v.size)));
        tr.appendChild(el('td', '', fmtDate(v.publishedAt)));
        var hashTd = el('td');
        hashTd.appendChild(el('code', '', String(v.sha256 || '').slice(0, 12) + '…'));
        tr.appendChild(hashTd);

        var ops = el('td', 'pm-ops');
        if (loggedIn) {
          if (v.version !== pkg.latest && !v.yanked) {
            ops.appendChild(actionBtn('设为推荐', 'activate', name, v.version));
            ops.appendChild(document.createTextNode(' '));
          }
          ops.appendChild(actionBtn(v.yanked ? '恢复' : '下架',
            v.yanked ? 'restore' : 'yank', name, v.version));
          ops.appendChild(document.createTextNode(' '));
          var del = actionBtn('删除', 'remove', name, v.version);
          del.className = 'pm-mini del';
          ops.appendChild(del);
        } else {
          ops.appendChild(el('span', 'pm-hint', '登录网站后可管理'));
        }
        tr.appendChild(ops);
        tbody.appendChild(tr);

        var cmdRow = el('tr');
        var cmdTd = el('td', 'pm-cmd');
        cmdTd.colSpan = 6;
        var tarball = url + '/dsh-plugins/' + String(v.file || '').replace(/^\/+/, '');
        var cmd = 'dsh plugin --profile web add ' + tarball + ' --ignore-scripts';
        cmdTd.appendChild(el('code', 'pm-code', cmd));
        var copy = el('button', 'pm-mini', '复制命令');
        copy.type = 'button';
        copy.addEventListener('click', function () {
          copyText(cmd).then(function () { status('安装命令已复制', 'ok'); })
            .catch(function () { status('复制失败，请手动选中命令', 'err'); });
        });
        cmdTd.appendChild(copy);
        if (v.compatNote) cmdTd.appendChild(el('span', 'pm-hint', '  ' + v.compatNote));
        cmdRow.appendChild(cmdTd);
        tbody.appendChild(cmdRow);
      });
      table.appendChild(tbody);
      box.appendChild(table);
      host.appendChild(box);
    });
  }

  function refreshList() {
    return fetchIndex().then(function (data) {
      indexData = data;
      renderList(data);
    }).catch(function (err) {
      var host = document.getElementById('pm-list');
      if (host) host.innerHTML = '<div class="pm-empty">读取插件清单失败：' + esc(err.message) + '</div>';
    });
  }

  /* ------------------------------------------------------------ 发布表单 */
  var parsedManifest = null;
  function datalistOptions() {
    var dl = el('datalist');
    categoriesOf(indexData || {}).forEach(function (c) {
      var o = el('option');
      o.value = c;
      dl.appendChild(o);
    });
    return dl;
  }
  // 登录后的发布页面：顶部二选一，DSH 插件 / 技能 Skill
  function setPublishType(type) {
    publishType = (type === 'skill') ? 'skill' : 'dsh';
    var dshFields = document.getElementById('pm-dsh-fields');
    var skillFields = document.getElementById('pm-skill-fields');
    if (dshFields) dshFields.style.display = publishType === 'dsh' ? '' : 'none';
    if (skillFields) skillFields.style.display = publishType === 'skill' ? '' : 'none';
    var btns = document.querySelectorAll('#pm-form [data-pm-type]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = 'pm-type-btn' +
        (btns[i].getAttribute('data-pm-type') === publishType ? ' active' : '');
    }
    var tip = document.getElementById('pm-type-tip');
    if (tip) tip.textContent = publishType === 'dsh'
      ? '写入内网 DSH 插件仓库，自动生成 SHA-256 并更新 index.json'
      : '写入 SkillHub 技能库，与官方「发布」页使用同一套后端接口';
    if (publishType === 'skill') loadSkillNamespaces();
  }

  function showForm(show, type) {
    var host = document.getElementById('pm-form-host');
    if (!host) return;
    host.innerHTML = '';
    parsedManifest = null;
    skillPreview = null;
    if (!show || !loggedIn) return;    // 未登录：发布入口完全不可用
    if (type) publishType = (type === 'skill') ? 'skill' : 'dsh';

    var form = el('div', 'pm-form');
    form.id = 'pm-form';
    form.appendChild(el('h3', '', '发布内容'));
    form.appendChild(el('p', 'pm-sub',
      '已用 SkillHub 网站账号登录。选择要发布的类型，两类内容共用同一套登录权限。'));

    var types = el('div', 'pm-types');
    types.innerHTML = [
      '<span class="pm-types-label">发布类型</span>',
      '<button type="button" class="pm-type-btn" data-pm-type="dsh">DSH 插件 (.tgz)</button>',
      '<button type="button" class="pm-type-btn" data-pm-type="skill">技能 Skill (.zip)</button>',
      '<span class="pm-type-tip" id="pm-type-tip"></span>'
    ].join('');
    form.appendChild(types);
    var typeBtns = types.querySelectorAll('[data-pm-type]');
    for (var i = 0; i < typeBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          setPublishType(btn.getAttribute('data-pm-type'));
        });
      })(typeBtns[i]);
    }

    /* ------------------------------ DSH 插件发布字段 ---------------------- */
    var dshFields = el('div');
    dshFields.id = 'pm-dsh-fields';
    var parsed = el('div', 'pm-parsed warn');
    parsed.id = 'pm-parsed';
    parsed.textContent = '尚未选择文件；若浏览器不支持自动解压，可手动填写包名与版本。';
    dshFields.appendChild(parsed);

    var grid = el('div', 'pm-grid');
    grid.innerHTML = [
      '<label class="pm-field"><span>插件包 (.tgz)</span>',
      '<input type="file" id="pm-file" accept=".tgz,.tar.gz,application/gzip"></label>',
      '<label class="pm-field"><span>包名</span>',
      '<input type="text" id="pm-name" placeholder="@scope/plugin-name">',
      '<small>与 package.json 的 name 一致，用于版本归组</small></label>',
      '<label class="pm-field"><span>版本号</span>',
      '<input type="text" id="pm-version" placeholder="0.6.3">',
      '<small>需为 x.y.z（可带预发布后缀），同版本默认拒绝覆盖</small></label>',
      '<label class="pm-field"><span>分类</span>',
      '<input type="text" id="pm-cat-input" list="pm-cat-list" value="其他" placeholder="其他">',
      '<small>可选用现有分类，也可直接输入新分类</small></label>',
      '<label class="pm-field"><span>标签（逗号分隔）</span>',
      '<input type="text" id="pm-tags" placeholder="官方, DSH, 离线"></label>',
      '<label class="pm-field"><span>兼容说明（可选）</span>',
      '<input type="text" id="pm-compat" placeholder="DSH 0.2.1-rc.5；Node >=24"></label>',
      '<label class="pm-field" style="grid-column:1/-1"><span>发布说明（可选）</span>',
      '<textarea id="pm-notes" placeholder="本次变更内容，便于同事选择版本"></textarea></label>'
    ].join('');
    dshFields.appendChild(grid);
    var dl = datalistOptions();
    dl.id = 'pm-cat-list';
    dshFields.appendChild(dl);

    var checks = el('div', 'pm-checks');
    checks.innerHTML = [
      '<label><input type="checkbox" id="pm-latest" checked> 设为推荐版本</label>',
      '<label><input type="checkbox" id="pm-replace"> 覆盖已存在的同版本</label>',
      '<label><input type="checkbox" id="pm-force"> 跳过「非 DSH 插件」校验</label>'
    ].join('');
    dshFields.appendChild(checks);

    var actions = el('div', 'pm-actions');
    var submit = el('button', 'pm-btn primary', '校验并发布 DSH 插件');
    submit.type = 'button'; submit.id = 'pm-submit';
    var cancel = el('button', 'pm-btn', '取消');
    cancel.type = 'button';
    actions.appendChild(submit);
    actions.appendChild(cancel);
    dshFields.appendChild(actions);
    form.appendChild(dshFields);

    /* ------------------------------ 技能 Skill 发布字段 ------------------- */
    var skillFields = el('div');
    skillFields.id = 'pm-skill-fields';
    skillFields.innerHTML = [
      '<div class="pm-skill-note">技能包写入 SkillHub 技能库，与顶部「发布」使用同一套接口。',
      '需要头像、更新已有技能等高级选项，可 ',
      '<a class="pm-link" href="', FULL_PUBLISH_URL,
      '" target="_blank" rel="noopener" data-pm-keep="1">打开完整发布页 ↗</a></div>',
      '<div class="pm-skill-note" style="background:#fff8ea;color:#7a4b00">',
      '提示：本离线部署默认关闭安全扫描器，平台会拒绝「公开 / 仅命名空间成员」的技能发布。',
      '默认已选「私有（仅自己可见）」；若启用了扫描器，可再改选其它可见性。</div>',
      '<div class="pm-parsed warn" id="pm-s-parsed">',
      '尚未选择文件；选择 .zip 技能包后会自动预检并读取包内名称。</div>',
      '<div class="pm-grid">',
      '<label class="pm-field"><span>技能包 (.zip)</span>',
      '<input type="file" id="pm-s-file" accept=".zip,application/zip"></label>',
      '<label class="pm-field"><span>命名空间</span>',
      '<select id="pm-s-ns"><option value="">读取中…</option></select>',
      '<small>只列出当前网站账号有权限的命名空间</small></label>',
      '<label class="pm-field"><span>可见性</span><select id="pm-s-vis">',
      '<option value="PUBLIC">公开（所有人可见，需安全扫描器）</option>',
      '<option value="NAMESPACE_ONLY">仅命名空间成员可见（需安全扫描器）</option>',
      '<option value="PRIVATE" selected>私有（仅自己可见）</option>',
      '</select></label>',
      '<label class="pm-field"><span>显示名称（可选）</span>',
      '<input type="text" id="pm-s-name" placeholder="留空则沿用包内名称"></label>',
      '</div>',
      '<div class="pm-checks"><label><input type="checkbox" id="pm-s-confirm"> ',
      '跳过压缩包告警（confirmWarnings）</label></div>',
      '<div class="pm-actions">',
      '<button class="pm-btn primary" id="pm-s-submit" type="button">校验并发布技能</button>',
      '<button class="pm-btn" id="pm-s-cancel" type="button">取消</button>',
      '</div>'
    ].join('');
    form.appendChild(skillFields);

    host.appendChild(form);

    document.getElementById('pm-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var note = document.getElementById('pm-parsed');
      note.className = 'pm-parsed warn';
      note.textContent = '正在解析 ' + file.name + ' …';
      readManifest(file).then(function (manifest) {
        parsedManifest = manifest;
        document.getElementById('pm-name').value = manifest.name || '';
        document.getElementById('pm-version').value = manifest.version || '';
        // 已有插件沿用其分类/标签，避免发布新版本时把元数据重置
        var existing = indexData && indexData.plugins && indexData.plugins[manifest.name];
        document.getElementById('pm-cat-input').value = existing
          ? txt(existing.category, '其他') : '其他';
        document.getElementById('pm-tags').value = existing
          ? (existing.tags || []).join(', ') : '';
        var dsh = manifest.dsh
          ? (Array.isArray(manifest.dsh) ? manifest.dsh.join(', ')
             : Object.keys(manifest.dsh).join(', ')) : '无';
        note.className = 'pm-parsed';
        note.textContent = '已解析：' + manifest.name + '@' + manifest.version +
          ' · license=' + (manifest.license || '未声明') +
          ' · Node=' + JSON.stringify((manifest.engines || {}).node || '未声明') +
          ' · dsh=[' + dsh + ']';
      }).catch(function (err) {
        parsedManifest = null;
        note.className = 'pm-parsed warn';
        note.textContent = '自动解析失败：' + err.message + '。可手动填写包名与版本后继续发布。';
      });
    });
    submit.addEventListener('click', doPublish);
    cancel.addEventListener('click', function () { showForm(false); });
    document.getElementById('pm-s-file').addEventListener('change', onSkillFileChange);
    document.getElementById('pm-s-submit').addEventListener('click', doPublishSkill);
    document.getElementById('pm-s-cancel').addEventListener('click', function () { showForm(false); });

    setPublishType(publishType);
  }

  /* ------------------------------------------------- 技能发布（官方 API） */
  function loadSkillNamespaces() {
    var sa = siteAuth();
    var sel = document.getElementById('pm-s-ns');
    if (!sa || !sel) return;
    if (skillNamespaces) { fillSkillNamespaces(skillNamespaces); return; }
    sel.innerHTML = '<option value="">正在读取命名空间…</option>';
    sa.apiJson(SKILL_NAMESPACES_URL).then(function (list) {
      skillNamespaces = Array.isArray(list) ? list : [];
      fillSkillNamespaces(skillNamespaces);
    }).catch(function (err) {
      sel.innerHTML = '<option value="">读取失败：' + esc(err.message) + '</option>';
    });
  }

  function fillSkillNamespaces(list) {
    var sel = document.getElementById('pm-s-ns');
    if (!sel) return;
    if (!list.length) {
      sel.innerHTML = '<option value="">（当前账号没有可用命名空间）</option>';
      return;
    }
    sel.innerHTML = list.map(function (ns) {
      return '<option value="' + esc(ns.slug) + '">' +
        esc(ns.displayName || ns.slug) + ' (' + esc(ns.slug) + ')</option>';
    }).join('');
  }

  function onSkillFileChange(e) {
    var sa = siteAuth();
    var note = document.getElementById('pm-s-parsed');
    var file = e.target.files && e.target.files[0];
    if (!file || !note || !sa) return;
    note.className = 'pm-parsed warn';
    note.textContent = '正在预检 ' + file.name + ' …';
    var fd = new FormData();
    fd.append('file', file);
    sa.apiWrite(SKILL_PREVIEW_URL, { method: 'POST', body: fd }).then(function (d) {
      skillPreview = d || {};
      note.className = 'pm-parsed';
      note.textContent = '预检通过：' + ((d && (d.displayName || d.name)) || file.name) +
        (d && d.version ? ' · v' + d.version : '') +
        (d && d.description ? ' · ' + String(d.description).slice(0, 70) : '');
      var nameEl = document.getElementById('pm-s-name');
      if (nameEl && !nameEl.value && d && (d.displayName || d.name)) {
        nameEl.value = d.displayName || d.name;
      }
    }).catch(function (err) {
      skillPreview = null;
      note.className = 'pm-parsed warn';
      note.textContent = '预检失败：' + err.message + '（确认包无误也可直接尝试发布）';
    });
  }

  function doPublishSkill() {
    if (!loggedIn) return status('请先登录网站后再发布', 'err');
    var sa = siteAuth();
    if (!sa) return status('登录模块尚未就绪，请刷新页面', 'err');
    var fileEl = document.getElementById('pm-s-file');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var nsEl = document.getElementById('pm-s-ns');
    var ns = nsEl ? (nsEl.value || '').trim() : '';
    var vis = (document.getElementById('pm-s-vis') || {}).value || 'PUBLIC';
    var name = (document.getElementById('pm-s-name') || {}).value || '';
    var confirmWarn = !!(document.getElementById('pm-s-confirm') || {}).checked;
    if (!file) return status('请先选择 .zip 技能包', 'err');
    if (!/\.zip$/i.test(file.name)) return status('技能包必须是 .zip 文件', 'err');
    if (!ns) return status('请选择命名空间', 'err');

    var btn = document.getElementById('pm-s-submit');
    if (btn) btn.disabled = true;
    status('正在发布技能包…', 'warn');
    var fd = new FormData();
    fd.append('file', file);
    fd.append('visibility', vis);
    fd.append('confirmWarnings', String(confirmWarn));
    fd.append('avatarAction', 'KEEP');
    if (name.trim()) fd.append('displayName', name.trim());
    var url = SKILL_PUBLISH_URL + encodeURIComponent(ns.replace(/^@/, '')) + '/publish';
    sa.apiWrite(url, { method: 'POST', body: fd }).then(function (d) {
      var label = (d && d.namespace || ns) + '/' + (d && d.slug || '?') +
        '@' + (d && d.version || '?');
      status('技能已发布：' + label + (d && d.status ? ' · ' + d.status : ''), 'ok');
      showForm(false);
    }).catch(function (err) {
      var msg = err.message || '发布失败';
      if (err.status === 401 || err.status === 403) onSessionLost();
      if (/precheck|warning|confirm/i.test(msg)) {
        msg += '（确认无风险可勾选「跳过压缩包告警」后重试）';
      }
      status('技能发布失败：' + msg, 'err');
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  }

  /* --------------------------------------------- 编辑插件元数据（分类/标签） */
  function showMetaForm(name) {
    if (!loggedIn) return status('请先登录', 'err');
    var host = document.getElementById('pm-form-host');
    var pkg = indexData && indexData.plugins && indexData.plugins[name];
    if (!host || !pkg) return;
    host.innerHTML = '';
    var form = el('div', 'pm-form');
    form.id = 'pm-form';
    form.appendChild(el('h3', '', '编辑插件信息 · ' + name));
    form.appendChild(el('p', 'pm-sub',
      '分类与标签用于市场内的筛选与搜索，保存后立即写回 index.json。'));
    var grid = el('div', 'pm-grid');
    grid.innerHTML = [
      '<label class="pm-field"><span>分类</span>',
      '<input type="text" id="pm-m-cat" list="pm-m-cats" placeholder="其他"></label>',
      '<label class="pm-field"><span>标签（逗号分隔）</span>',
      '<input type="text" id="pm-m-tags" placeholder="官方, DSH"></label>',
      '<label class="pm-field" style="grid-column:1/-1"><span>插件简介</span>',
      '<textarea id="pm-m-desc"></textarea></label>'
    ].join('');
    form.appendChild(grid);
    var dl = datalistOptions();
    dl.id = 'pm-m-cats';
    form.appendChild(dl);
    var actions = el('div', 'pm-actions');
    var save = el('button', 'pm-btn primary', '保存信息');
    save.type = 'button';
    var cancel = el('button', 'pm-btn', '取消');
    cancel.type = 'button';
    actions.appendChild(save); actions.appendChild(cancel);
    form.appendChild(actions);
    host.appendChild(form);
    document.getElementById('pm-m-cat').value = txt(pkg.category, '其他');
    document.getElementById('pm-m-tags').value = (pkg.tags || []).join(', ');
    document.getElementById('pm-m-desc').value = txt(pkg.description);
    save.addEventListener('click', function () { doSaveMeta(name); });
    cancel.addEventListener('click', function () { showForm(false); });
  }

  function doSaveMeta(name) {
    var cat = (document.getElementById('pm-m-cat').value || '').trim() || '其他';
    var tags = parseTags(document.getElementById('pm-m-tags').value);
    var desc = (document.getElementById('pm-m-desc').value || '').trim();
    status('正在保存插件信息…', 'warn');
    fetchIndex().then(function (index) {
      var pkg = index.plugins && index.plugins[name];
      if (!pkg) throw new Error('插件不存在：' + name);
      pkg.category = cat;
      pkg.tags = tags;
      pkg.description = desc;
      if (!Array.isArray(index.categories)) index.categories = FALLBACK_CATEGORIES.slice();
      if (index.categories.indexOf(cat) < 0) index.categories.push(cat);
      return putIndex(index);
    }).then(function () {
      status('插件信息已更新', 'ok');
      showForm(false);
      return refreshList();
    }).catch(function (err) { status('保存失败：' + err.message, 'err'); });
  }

  /* --------------------------------------------------------------- 发布 */
  function doPublish() {
    if (!loggedIn) return status('请先登录后再发布插件', 'err');
    var fileEl = document.getElementById('pm-file');
    var name = (document.getElementById('pm-name').value || '').trim();
    var version = (document.getElementById('pm-version').value || '').trim();
    var notes = document.getElementById('pm-notes').value.trim();
    var compat = document.getElementById('pm-compat').value.trim();
    var category = (document.getElementById('pm-cat-input').value || '').trim() || '其他';
    var tags = parseTags(document.getElementById('pm-tags').value);
    var setLatest = document.getElementById('pm-latest').checked;
    var replace = document.getElementById('pm-replace').checked;
    var force = document.getElementById('pm-force').checked;
    var file = fileEl && fileEl.files && fileEl.files[0];

    if (!file) return status('请先选择 .tgz 插件包', 'err');
    if (!/\.(tgz|tar\.gz)$/i.test(file.name)) return status('文件名必须以 .tgz 结尾', 'err');
    if (!/^[A-Za-z0-9@._/-]+$/.test(name)) return status('包名含非法字符', 'err');
    if (!/^\d+\.\d+\.\d+/.test(version)) return status('版本号需为 x.y.z 格式', 'err');

    var manifest = parsedManifest || {};
    if (!manifest.dsh && !force) {
      return status('包内 package.json 没有 dsh 字段，确认是 DSH 插件请勾选「跳过校验」', 'warn');
    }
    var filename = safeSlug(name) + '-' + version.replace(/[^A-Za-z0-9._-]/g, '-') + '.tgz';
    var submit = document.getElementById('pm-submit');
    submit.disabled = true;
    status('正在校验并上传…', 'warn');

    var latest = null;
    return fetchIndex().then(function (index) {
      latest = index;
      var pkg = index.plugins && index.plugins[name];
      var dup = pkg && (pkg.versions || []).some(function (v) { return v.version === version; });
      if (dup && !replace) throw new Error('版本 ' + name + '@' + version + ' 已存在，勾选「覆盖」或换个版本号');
      return file.arrayBuffer();
    }).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var digest = sha256Hex(bytes);
      status('校验和 ' + digest.slice(0, 16) + '…，正在上传制品…', 'warn');
      return putFile(filename, file).then(function () {
        return { bytes: bytes, digest: digest };
      });
    }).then(function (info) {
      status('制品已上传，正在写入版本清单…', 'warn');
      var pkg = latest.plugins[name] || {
        name: name,
        description: manifest.description || '',
        license: manifest.license || '',
        homepage: manifest.homepage || '',
        category: category,
        tags: tags,
        latest: '',
        versions: []
      };
      var entry = {
        version: version,
        file: 'versions/' + filename,
        sha256: info.digest,
        size: info.bytes.length,
        publishedAt: nowIso(),
        notes: notes,
        yanked: false,
        package: {
          name: manifest.name || name,
          version: manifest.version || version,
          license: manifest.license || '',
          engines: manifest.engines || {},
          peerDependencies: manifest.peerDependencies || {},
          dsh: manifest.dsh
            ? (Array.isArray(manifest.dsh) ? manifest.dsh : Object.keys(manifest.dsh).sort())
            : []
        }
      };
      if (compat) entry.compatNote = compat;
      pkg.versions = (pkg.versions || []).filter(function (v) { return v.version !== version; });
      pkg.versions.push(entry);
      pkg.versions.sort(function (a, b) { return cmpVersion(a.version, b.version); });
      pkg.description = manifest.description || pkg.description || '';
      pkg.license = pkg.license || manifest.license || '';
      pkg.homepage = pkg.homepage || manifest.homepage || '';
      pkg.category = category;
      pkg.tags = tags;
      if (!Array.isArray(latest.categories)) latest.categories = FALLBACK_CATEGORIES.slice();
      if (latest.categories.indexOf(category) < 0) latest.categories.push(category);
      if (setLatest || !pkg.latest || cmpVersion(version, pkg.latest) >= 0) pkg.latest = version;
      if (!latest.recommended || setLatest) latest.recommended = name;
      latest.plugins[name] = pkg;
      return putIndex(latest);
    }).then(function () {
      status('已发布 ' + name + '@' + version, 'ok');
      showForm(false);
      return refreshList();
    }).catch(function (err) {
      status('发布失败：' + err.message, 'err');
    }).then(function () {
      if (submit) submit.disabled = false;
    });
  }

  /* --------------------------------------------- 版本管理：推荐/下架/删除 */
  function doAction(kind, name, version) {
    if (!loggedIn) return status('请先登录后再管理版本', 'err');
    var labels = { activate: '设为推荐', yank: '下架', restore: '恢复', remove: '删除' };
    if (kind === 'remove' && !window.confirm('确定删除 ' + name + '@' + version +
        ' 吗？制品文件与清单记录都会移除，此操作不可撤销。')) return;
    status('正在' + labels[kind] + '…', 'warn');

    var index = null, orphan = null;
    fetchIndex().then(function (data) {
      index = data;
      var pkg = index.plugins && index.plugins[name];
      if (!pkg) throw new Error('插件不存在：' + name);
      var entry = (pkg.versions || []).filter(function (v) { return v.version === version; })[0];
      if (!entry) throw new Error('版本不存在：' + version);

      if (kind === 'activate') {
        if (entry.yanked) throw new Error('已下架版本不能设为推荐，请先恢复');
        pkg.latest = version;
        index.recommended = name;
      } else if (kind === 'yank' || kind === 'restore') {
        entry.yanked = (kind === 'yank');
        if (kind === 'yank' && pkg.latest === version) {
          var alive = pkg.versions.filter(function (v) { return !v.yanked && v.version !== version; });
          alive.sort(function (a, b) { return cmpVersion(b.version, a.version); });
          pkg.latest = alive.length ? alive[0].version : '';
        }
      } else if (kind === 'remove') {
        pkg.versions = pkg.versions.filter(function (v) { return v.version !== version; });
        orphan = String(entry.file || '').split('/').pop();
        if (pkg.latest === version) {
          pkg.versions.sort(function (a, b) { return cmpVersion(b.version, a.version); });
          pkg.latest = pkg.versions.length ? pkg.versions[0].version : '';
        }
        if (!pkg.versions.length) {
          delete index.plugins[name];
          if (index.recommended === name) {
            index.recommended = Object.keys(index.plugins)[0] || '';
          }
        }
      }
      return putIndex(index);
    }).then(function () {
      if (!orphan) return null;
      // 清单已更新成功，制品文件删除失败只降级为警告，不回滚清单
      return deleteFile(orphan).then(function () { return null; })
        .catch(function () { return '制品文件删除失败（可稍后在服务器清理）'; });
    }).then(function (warning) {
      status(warning
        ? labels[kind] + '完成，但' + warning
        : labels[kind] + ' ' + name + '@' + version + ' 完成', warning ? 'warn' : 'ok');
      return refreshList();
    }).catch(function (err) {
      status(labels[kind] + '失败：' + err.message, 'err');
    });
  }

  /* ------------------------------------------------------------ 事件绑定 */
  // 顶部导航是唯一入口：点击直接展开面板并高亮，再次点击收起。
  // 捕获阶段拦截，避免 React Router / 浏览器默认跳转；中键与新标签仍走原 URL。
  document.addEventListener('click', function (e) {
    var target = e.target;
    var a = target && target.closest ? target.closest('a[data-site-nav="dsh"]') : null;
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isHome()) {
      window.location.href = '/#dsh-plugins';
      return;
    }
    setActive(!active);
  }, true);

  // 跳到其它站内路由时收起面板（含「首页」href=/）；独立门户页除外
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('data-site-nav') || a.hasAttribute('data-pm-keep')) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '/' && href.indexOf('/#') !== 0) setActive(false);
  }, true);

  window.addEventListener('hashchange', function () {
    if (window.location.hash === HASH) setActive(true, true);
    else if (active) setActive(false, true);
  });
  window.addEventListener('popstate', function () {
    if (!isHome()) { setActive(false, true); return; }
    setActive(window.location.hash === HASH, true);
  });

  // inject.js 的 MutationObserver 每次调度时调用，保证面板在 React 重渲染后仍在
  function sync() {
    if (!document.body) return;
    if (!isHome()) {
      if (panel && panel.isConnected && panel.style.display !== 'none') panel.style.display = 'none';
      setBodyActive(false);
      active = false;
      syncNavState();
      refreshLogin();     // 从 /search 等页进入时也先确认网站登录态
      return;
    }
    ensurePanel();
    var want = window.location.hash === HASH;
    if (want !== active) setActive(want, true);
    else {
      setBodyActive(active);
      var wantDisplay = active ? '' : 'none';
      if (panel.style.display !== wantDisplay) panel.style.display = wantDisplay;
    }
    syncNavState();
    // 面板被 React 重渲染挤掉时补挂
    if (panel && !panel.isConnected) {
      var anchor = panelAnchor();
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
      else document.body.appendChild(panel);
    }
    refreshLogin();
  }
  window.__sitePluginMarketSync = sync;

  // 会话复核统一由 inject.js 在路由变化 / 重新获得焦点时触发，
  // 这里只订阅 SiteAuth.onChange 的广播，避免重复请求。
  bindSiteAuth();
  sync();
})();
