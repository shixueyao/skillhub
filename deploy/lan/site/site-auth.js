/* ============================================================================
 * SkillHub 网站登录态（局域网定制层共用模块）
 *
 * 官方 SkillHub 前台登录不是「前端持有 token」，而是服务端 Spring Session：
 *   POST /api/v1/auth/local/login  ->  Set-Cookie: SESSION=... (HttpOnly, Redis)
 * 浏览器同源请求自动携带该 cookie，JS 读不到也不需要读。
 *
 * 因此本模块只做一件事：用 GET /api/v1/auth/me 判断当前网站会话是否有效
 * （200 = 已登录，401 = 未登录），并把用户信息和 CSRF 辅助方法提供给
 * inject.js / plugin-market.js / admin.html 复用。
 *
 * 写操作的最终安全边界在 nginx：PUT/DELETE 由 auth_request 向 Java 后端
 * GET /api/cli/v1/auth/whoami 复核会话，前端判断只用于界面显隐。
 * ========================================================================== */
(function (global) {
  'use strict';

  var ME_URL = '/api/v1/auth/me';
  var PROVIDERS_URL = '/api/v1/auth/providers';
  var LOGOUT_URL = '/api/v1/auth/logout';

  var state = { checked: false, user: null, pending: null, initialized: false };
  var listeners = [];

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state.user); } catch (e) { /* 单个订阅者出错不影响其它 */ }
    }
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    if (state.checked) {
      try { fn(state.user); } catch (e) { /* ignore */ }
    }
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function user() { return state.user; }
  function checked() { return state.checked; }
  function isLoggedIn() { return !!state.user; }
  function displayName(u) {
    var who = u || state.user;
    if (!who) return '';
    return who.displayName || who.username || who.userId || '已登录用户';
  }

  function csrfToken() {
    var m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // 后端用 CookieCsrfTokenRepository（XSRF-TOKEN 非 HttpOnly）。
  // 首次访问可能还没有该 cookie，GET providers 会触发下发。
  function ensureCsrf() {
    var token = csrfToken();
    if (token) return Promise.resolve(token);
    return fetch(PROVIDERS_URL, { credentials: 'same-origin', cache: 'no-store' })
      .then(function () { return csrfToken(); });
  }

  function parseEnvelope(r) {
    return r.text().then(function (text) {
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { /* 非 JSON */ }
      if (!r.ok || (data && typeof data.code !== 'undefined' && data.code !== 0)) {
        var err = new Error((data && (data.msg || data.message)) || ('HTTP ' + r.status));
        err.status = r.status;
        err.body = data;
        throw err;
      }
      return data && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
    });
  }

  // 统一的 JSON 请求；FormData 可直接作为 body 传入（不设置 Content-Type）。
  function apiJson(url, opt) {
    opt = opt || {};
    var method = (opt.method || 'GET').toUpperCase();
    var h = Object.assign({ Accept: 'application/json' }, opt.headers || {});
    if (method !== 'GET' && method !== 'HEAD') {
      var token = csrfToken();
      if (token) h['X-XSRF-TOKEN'] = token;
    }
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: h,
      body: opt.body
    }).then(parseEnvelope);
  }

  // 需要先确保 XSRF-TOKEN 存在再发的写请求
  function apiWrite(url, opt) {
    return ensureCsrf().then(function () {
      opt = Object.assign({}, opt);
      var token = csrfToken();
      opt.headers = Object.assign({}, opt.headers, token ? { 'X-XSRF-TOKEN': token } : {});
      return apiJson(url, opt);
    });
  }

  // 返回 Promise<User|null>。并发调用共享同一个请求；只在登录态变化时广播。
  function refresh(force) {
    if (state.pending && !force) return state.pending;
    state.pending = fetch(ME_URL, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().then(function (d) { return (d && d.data) || null; });
    }).catch(function () {
      return null;   // 后端暂不可用/网络异常按未登录处理，界面保持只读
    }).then(function (u) {
      var before = state.user ? (state.user.userId || '') : '';
      state.user = u || null;
      state.checked = true;
      state.pending = null;
      var after = state.user ? (state.user.userId || '') : '';
      if (!state.initialized || before !== after) {
        state.initialized = true;
        emit();
      }
      return state.user;
    });
    return state.pending;
  }

  function loginUrl(returnTo) {
    var target = returnTo || (global.location.pathname + global.location.search + global.location.hash);
    if (typeof target !== 'string' || target.charAt(0) !== '/') target = '/';
    return '/login?returnTo=' + encodeURIComponent(target);
  }

  function goLogin(returnTo) {
    global.location.href = loginUrl(returnTo);
  }

  function logout() {
    return ensureCsrf().then(function () {
      return fetch(LOGOUT_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-XSRF-TOKEN': csrfToken() }
      });
    }).then(function () {
      state.user = null;
      state.checked = true;
      emit();
      return true;
    });
  }

  global.SiteAuth = {
    refresh: refresh,
    onChange: onChange,
    user: user,
    checked: checked,
    isLoggedIn: isLoggedIn,
    displayName: displayName,
    loginUrl: loginUrl,
    goLogin: goLogin,
    logout: logout,
    csrfToken: csrfToken,
    ensureCsrf: ensureCsrf,
    apiJson: apiJson,
    apiWrite: apiWrite
  };
})(window);
