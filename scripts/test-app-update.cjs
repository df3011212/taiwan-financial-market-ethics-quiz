/* Exercises the real update module; browser/network primitives are deterministic. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../assets/app-update.js'), 'utf8');
const CURRENT = '20261030-home-1';
const NEXT = { version: '20261030-home-2', label: '2026.10.30.4' };
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function element(hidden = false, text = '') {
  const classes = new Set(hidden ? ['hidden'] : []);
  return {
    hidden, textContent: text, disabled: false, handlers: {},
    classList: {
      contains: value => classes.has(value),
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle: (value, force) => { const add = force === undefined ? !classes.has(value) : force; if (add) classes.add(value); else classes.delete(value); return add; }
    },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    click() { if (!this.disabled) return this.handlers.click?.({}); }
  };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function response(data, ok = true) { return { ok, json: async () => data }; }
function load(options = {}) {
  let now = options.now || 100000;
  const nodes = {
    appVersion: element(false), checkAppUpdate: element(false, '檢查更新'),
    appUpdateNotice: element(true), appUpdateMessage: element(false),
    applyAppUpdate: element(false, '更新版本'),
    study: element(!options.active), quiz: element(!options.active)
  };
  const windowHandlers = {}, documentHandlers = {}, requests = [], navigations = [], confirmations = [], timers = new Map();
  let timerId = 0;
  const url = new URL(options.href || 'https://example.test/quiz/?source=home&launch=1#practice');
  const location = { href: url.href, protocol: url.protocol, replace(target) { if (options.navigationError) throw new Error('Blocked'); navigations.push(target); } };
  const document = {
    visibilityState: 'visible',
    querySelector: selector => selector === 'meta[name="app-version"]' && !options.noMeta ? { getAttribute: () => options.version || CURRENT } : selector === 'meta[name="app-version-label"]' && options.label ? { getAttribute: () => options.label } : null,
    getElementById: id => nodes[id] || null,
    addEventListener: (name, handler) => { documentHandlers[name] = handler; }
  };
  class Clock extends Date { static now() { return now; } }
  const sandbox = {
    URL, Promise, Date: Clock, document, location,
    __initialSession: options.active ? { mode: options.mode || 'practice', answers: [2, null] } : null,
    AbortController,
    setTimeout(handler, delay) { const id = ++timerId; timers.set(id, { handler, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch(url, init) { requests.push({ url, init }); if (options.fetch) return options.fetch(url, init, requests.length); return Promise.resolve(response(Object.hasOwn(options, 'manifest') ? options.manifest : { version: CURRENT, label: '2026.10.30.3' })); },
    addEventListener(name, handler) { windowHandlers[name] = handler; },
    confirm(text) { confirmations.push(text); return options.confirm ?? false; }
  };
  Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('Update module must never access storage'); } });
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext('let session = __initialSession;', context);
  vm.runInContext(source, context);
  return {
    nodes, requests, navigations, confirmations, timers, context, document, location,
    check: manual => sandbox.SFI_APP_UPDATE.check(manual),
    advance: delta => { now += delta; },
    event: (name, event = {}) => (windowHandlers[name] || documentHandlers[name])?.(event),
    setSession(value, visible = Boolean(value)) { sandbox.__nextSession = value; vm.runInContext('session = __nextSession;', context); nodes.study.hidden = nodes.quiz.hidden = !visible; nodes.study.classList.toggle('hidden', !visible); nodes.quiz.classList.toggle('hidden', !visible); }
  };
}

test('startup checks without cache; current version does not navigate', async () => {
  const env = load(); const result = await env.check();
  assert.equal(result.status, 'current'); assert.equal(env.requests.length, 1); assert.equal(env.navigations.length, 0);
  assert.equal(env.nodes.appVersion.textContent, '版本 ' + CURRENT);
  const request = env.requests[0]; assert.equal(request.init.cache, 'no-store');
  assert.equal(new URL(request.url).pathname, '/quiz/version.json'); assert.equal(new URL(request.url).searchParams.get('_fresh'), '100000');
  assert.equal(env.nodes.appUpdateNotice.hidden, true); assert.equal(env.nodes.checkAppUpdate.disabled, false); assert.equal(env.timers.size, 0);
});
test('idle new version navigates exactly once and preserves unrelated URL state', async () => {
  const env = load({ manifest: NEXT }); assert.equal((await env.check()).status, 'updating');
  await env.check(true); env.event('focus'); env.event('pageshow', { persisted: true });
  assert.equal(env.navigations.length, 1); const target = new URL(env.navigations[0]);
  assert.equal(target.origin, 'https://example.test'); assert.equal(target.pathname, '/quiz/index.html');
  assert.equal(target.searchParams.get('build'), NEXT.version); assert.equal(target.searchParams.get('_fresh'), '100000');
  assert.equal(target.searchParams.get('source'), 'home'); assert.equal(target.searchParams.has('launch'), false); assert.equal(target.hash, '#practice');
});
test('human version label is preferred over the internal build identifier', async () => {
  const env = load({ label: '2026.10.30.3' }); await env.check(); assert.equal(env.nodes.appVersion.textContent, '版本 2026.10.30.3');
});
test('a quiz starting during fetch suppresses automatic navigation', async () => {
  const request = deferred(), env = load({ fetch: () => request.promise });
  const check = env.check(); env.setSession({ mode: 'practice', answers: [3] });
  request.resolve(response(NEXT)); assert.equal((await check).status, 'available');
  assert.equal(env.navigations.length, 0); assert.equal(env.nodes.appUpdateNotice.hidden, false); assert.equal(env.nodes.applyAppUpdate.hidden, false);
  assert.match(env.nodes.appUpdateMessage.textContent, /目前作答會保留/);
});
test('active quiz shows an update banner; cancelling retains all answers', async () => {
  const env = load({ active: true, manifest: NEXT, confirm: false }); const before = vm.runInContext('JSON.stringify(session)', env.context);
  await env.check(); env.nodes.applyAppUpdate.click();
  assert.equal(env.navigations.length, 0); assert.equal(env.confirmations.length, 1); assert.match(env.confirmations[0], /尚未確認或交卷/);
  assert.equal(vm.runInContext('JSON.stringify(session)', env.context), before);
});
test('explicitly confirmed update navigates; existing saved state is untouched', async () => {
  const env = load({ active: true, manifest: NEXT, confirm: true }); const before = vm.runInContext('JSON.stringify(session)', env.context);
  await env.check(); env.nodes.applyAppUpdate.click();
  assert.equal(env.navigations.length, 1); assert.equal(vm.runInContext('JSON.stringify(session)', env.context), before);
});
test('listening is also an active session; completed hidden quiz is idle', async () => {
  const listening = load({ active: true, mode: 'listen', manifest: NEXT }); assert.equal((await listening.check()).status, 'available'); assert.equal(listening.navigations.length, 0);
  const completed = load({ active: true, manifest: NEXT }); completed.nodes.quiz.classList.add('hidden');
  assert.equal((await completed.check()).status, 'updating'); assert.equal(completed.navigations.length, 1);
});
test('automatic events share 30 second throttle; manual checks force a request', async () => {
  const env = load(); await env.check();
  env.event('focus'); env.event('pageshow', { persisted: true }); env.event('visibilitychange'); await Promise.resolve(); assert.equal(env.requests.length, 1);
  env.advance(30000); env.event('pageshow', { persisted: false }); await Promise.resolve(); assert.equal(env.requests.length, 1);
  env.document.visibilityState = 'hidden'; env.event('visibilitychange'); await Promise.resolve(); assert.equal(env.requests.length, 1);
  env.document.visibilityState = 'visible'; env.event('visibilitychange'); await env.check(); assert.equal(env.requests.length, 2);
  assert.equal((await env.check()).status, 'throttled'); await env.check(true); assert.equal(env.requests.length, 3);
});
test('manual request joins in-flight automatic request and receives feedback', async () => {
  const request = deferred(), env = load({ fetch: () => request.promise });
  const automatic = env.check(), manual = env.check(true); assert.equal(automatic, manual);
  request.resolve(response({ version: CURRENT, label: '2026.10.30.3' })); await manual;
  assert.equal(env.requests.length, 1); assert.match(env.nodes.appUpdateMessage.textContent, /目前已是最新版本/);
  assert.equal(env.nodes.applyAppUpdate.hidden, true); assert.equal(env.nodes.checkAppUpdate.disabled, false);
});
test('already requested build stops automatic loops; manual retries with new fresh value', async () => {
  const env = load({ href: `https://example.test/quiz/index.html?build=${NEXT.version}&_fresh=100000&keep=yes`, manifest: NEXT });
  assert.equal((await env.check()).status, 'waiting'); assert.equal(env.navigations.length, 0); assert.match(env.nodes.appUpdateMessage.textContent, /網站正在更新/);
  assert.equal((await env.check(true)).status, 'updating'); const target = new URL(env.navigations[0]);
  assert.equal(target.searchParams.get('_fresh'), '100001'); assert.equal(target.searchParams.get('keep'), 'yes');
});
test('offline automatic checks are quiet; manual errors retain the page', async () => {
  const env = load({ fetch: () => Promise.reject(new Error('Network unavailable')) });
  assert.equal((await env.check()).status, 'offline'); assert.equal(env.nodes.appUpdateNotice.hidden, true);
  assert.equal((await env.check(true)).status, 'offline'); assert.match(env.nodes.appUpdateMessage.textContent, /無法連線/); assert.equal(env.navigations.length, 0);
});
test('file mode and missing version are safe and do not request the network', async () => {
  const file = load({ href: 'file:///A:/quiz/index.html' }); assert.equal((await file.check()).status, 'local'); assert.equal(file.requests.length, 0); await file.check(true); assert.equal(file.navigations.length, 0);
  const missing = load({ noMeta: true }); assert.equal((await missing.check(true)).status, 'unknown-version'); assert.equal(missing.requests.length, 0);
});
test('invalid manifest versions and oversized labels never become navigation targets', async () => {
  for (const manifest of [{ version: 'https://evil.test/' }, { version: 'x'.repeat(81) }, { version: NEXT.version, label: 'x'.repeat(81) }, [], null]) {
    const env = load({ manifest }); await env.check(true); assert.equal(env.navigations.length, 0); assert.match(env.nodes.appUpdateMessage.textContent, /無法連線/);
  }
});
test('manifest label is displayed as text without interpreting markup', async () => {
  const env = load({ active: true, manifest: { version: NEXT.version, label: '<img src=x onerror=alert(1)>' } }); await env.check();
  assert.match(env.nodes.appUpdateMessage.textContent, /<img src=x onerror=alert\(1\)>/); assert.equal(env.navigations.length, 0);
});
test('synchronous fetch failure clears busy state and permits a later manual retry', async () => {
  const env = load({ fetch: (_url, _init, count) => { if (count === 1) throw new Error('Sync failure'); return Promise.resolve(response({ version: CURRENT })); } });
  assert.equal((await env.check()).status, 'offline'); assert.equal(env.nodes.checkAppUpdate.disabled, false);
  assert.equal((await env.check(true)).status, 'current'); assert.equal(env.requests.length, 2);
});
test('a stalled request times out and releases the manual update controls', async () => {
  const env = load({ fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('Aborted')))) });
  const pending = env.check(true); await Promise.resolve();
  assert.equal(env.timers.size, 1); const timeout = [...env.timers.values()][0]; assert.equal(timeout.delay, 10000);
  timeout.handler(); assert.equal((await pending).status, 'offline'); assert.equal(env.nodes.checkAppUpdate.disabled, false); assert.equal(env.timers.size, 0);
  assert.match(env.nodes.appUpdateMessage.textContent, /無法連線/);
});
test('HTTP failure and navigation failure are handled without changing answer state', async () => {
  const http = load({ fetch: () => Promise.resolve(response({}, false)) }); assert.equal((await http.check(true)).status, 'offline');
  const nav = load({ manifest: NEXT, navigationError: true }); assert.equal((await nav.check()).status, 'navigation-error'); assert.match(nav.nodes.appUpdateMessage.textContent, /無法重新載入/);
});

(async () => {
  for (const { name, run } of tests) { await run(); console.log('PASS', name); }
  console.log(`PASS: ${tests.length} app-update tests; real module, deterministic DOM/network/clock.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
