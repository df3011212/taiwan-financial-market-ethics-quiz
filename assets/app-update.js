/* Cache-busted version checks for browser tabs and Home Screen web clips.
 * Does not change answers, tracking records, or browser storage. */
(() => {
  'use strict';

  const AUTO_INTERVAL = 30000;
  const REQUEST_TIMEOUT = 10000;
  const versionPattern = /^[a-zA-Z0-9._-]{1,80}$/;
  const meta = document.querySelector('meta[name="app-version"]');
  const currentVersion = meta?.getAttribute('content') || '';
  const currentLabel = document.querySelector('meta[name="app-version-label"]')?.getAttribute('content') || currentVersion;
  const versionText = document.getElementById('appVersion');
  const checkButton = document.getElementById('checkAppUpdate');
  const notice = document.getElementById('appUpdateNotice');
  const message = document.getElementById('appUpdateMessage');
  const applyButton = document.getElementById('applyAppUpdate');
  const checkLabel = checkButton?.textContent || '檢查更新';
  let inFlight = null;
  let manualRequested = false;
  let lastStarted = -Infinity;
  let pendingVersion = null;
  let navigating = false;

  if (versionText) versionText.textContent = `版本 ${currentLabel || '未知'}`;

  function isOnlinePage() {
    return location.protocol === 'https:' || location.protocol === 'http:';
  }

  function isPracticing() {
    // session is a top-level lexical binding in the original quiz script.
    let active = null;
    try { if (typeof session !== 'undefined') active = session; } catch {}
    const study = document.getElementById('study');
    const quiz = document.getElementById('quiz');
    return Boolean(active && study && quiz && !study.hidden && !quiz.hidden &&
      !study.classList.contains('hidden') && !quiz.classList.contains('hidden'));
  }

  function showMessage(text, canApply = false) {
    if (message) message.textContent = text;
    if (notice) { notice.hidden = false; notice.classList.remove('hidden'); }
    if (applyButton) {
      applyButton.hidden = !canApply;
      applyButton.classList.toggle('hidden', !canApply);
      applyButton.disabled = Boolean(inFlight) || !canApply;
      applyButton.textContent = '更新版本';
    }
  }

  function hideMessage() {
    if (notice) { notice.hidden = true; notice.classList.add('hidden'); }
    if (applyButton) { applyButton.hidden = true; applyButton.disabled = true; }
  }

  function setBusy(busy) {
    if (checkButton) {
      checkButton.disabled = busy;
      checkButton.textContent = busy ? '檢查中…' : checkLabel;
    }
    if (applyButton) applyButton.disabled = busy || !pendingVersion;
  }

  function parseManifest(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.version !== 'string' || !versionPattern.test(data.version)) {
      throw new Error('Invalid version manifest');
    }
    if (data.label !== undefined && (typeof data.label !== 'string' ||
      data.label.length > 80 || !data.label.trim())) throw new Error('Invalid version label');
    return { version: data.version, label: data.label?.trim() || data.version };
  }

  function navigateTo(version) {
    if (navigating) return { status: 'navigating' };
    const current = new URL(location.href);
    const target = new URL('index.html', current);
    target.search = current.search;
    target.hash = current.hash;
    target.searchParams.delete('launch');
    target.searchParams.delete('fresh');
    target.searchParams.set('build', version.version);
    const previousFresh = Number(current.searchParams.get('_fresh'));
    const now = Date.now();
    const fresh = Number.isSafeInteger(previousFresh) && previousFresh >= now &&
      previousFresh < Number.MAX_SAFE_INTEGER ? previousFresh + 1 : now;
    target.searchParams.set('_fresh', String(fresh));
    navigating = true;
    try {
      location.replace(target.href);
      return { status: 'updating', version: version.version };
    } catch {
      navigating = false;
      showMessage('無法重新載入網站，請稍後再試；目前作答仍保留。', true);
      return { status: 'navigation-error' };
    }
  }

  function handleVersion(version, manual) {
    if (version.version === currentVersion) {
      pendingVersion = null;
      if (manual) showMessage(`目前已是最新版本（${version.label}）。`);
      else hideMessage();
      return { status: 'current', version: version.version };
    }
    pendingVersion = version;
    // A CDN may serve an old HTML document after the first cache-busted load.
    // Automatic checks stop here instead of redirecting the same build forever.
    const alreadyRequested = new URL(location.href).searchParams.get('build') === version.version;
    if (alreadyRequested && !manual) {
      showMessage('網站正在更新，請稍後再試。你可以稍後按「更新版本」重新載入；目前作答仍保留。', true);
      return { status: 'waiting', version: version.version };
    }
    // Read this after fetch resolves: a user may have begun a quiz during it.
    if (isPracticing()) {
      showMessage(`已有新版本（${version.label}）。目前作答會保留；可完成本回後更新，或按「更新版本」結束本回並更新。`, true);
      return { status: 'available', version: version.version };
    }
    return navigateTo(version);
  }

  function check(manual = false) {
    manual = manual === true;
    if (navigating) return Promise.resolve({ status: 'navigating' });
    if (!isOnlinePage()) {
      if (manual) showMessage('本機檔案模式不會自動更新，請開啟線上網站檢查更新。');
      return Promise.resolve({ status: 'local' });
    }
    if (!versionPattern.test(currentVersion)) {
      if (manual) showMessage('無法辨識目前版本，請重新開啟線上網站；目前作答仍保留。');
      return Promise.resolve({ status: 'unknown-version' });
    }
    if (inFlight) {
      // A manual click joins an existing automatic request without losing its
      // explicit success/error feedback or forcing a second network request.
      manualRequested ||= manual;
      return inFlight;
    }
    const now = Date.now();
    if (!manual && now - lastStarted < AUTO_INTERVAL) return Promise.resolve({ status: 'throttled' });
    lastStarted = now;
    manualRequested = manual;
    setBusy(true);
    // Queue the work so even a synchronous fetch failure cannot leave inFlight
    // assigned to an already-completed promise after its cleanup ran.
    inFlight = Promise.resolve().then(async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
      try {
        const manifestUrl = new URL('version.json', location.href);
        manifestUrl.searchParams.set('_fresh', String(Date.now()));
        const options = { cache: 'no-store' };
        if (controller) options.signal = controller.signal;
        const response = await fetch(manifestUrl.href, options);
        if (!response.ok) throw new Error('Version request failed');
        const version = parseManifest(await response.json());
        return handleVersion(version, manualRequested);
      } catch {
        if (manualRequested) showMessage('目前無法連線檢查更新，請稍後再試；目前作答仍保留。', Boolean(pendingVersion));
        return { status: 'offline' };
      } finally {
        if (timeout !== null) clearTimeout(timeout);
      }
    }).finally(() => {
      inFlight = null;
      manualRequested = false;
      setBusy(false);
    });
    return inFlight;
  }

  function applyUpdate() {
    if (!pendingVersion || inFlight || navigating) return;
    if (isPracticing() && !window.confirm('更新會結束目前這回練習，尚未確認或交卷的作答將捨棄；已儲存的錯題與追蹤紀錄會保留。確定現在更新嗎？')) return;
    navigateTo(pendingVersion);
  }

  checkButton?.addEventListener('click', () => { void check(true); });
  applyButton?.addEventListener('click', applyUpdate);
  window.addEventListener('pageshow', event => { if (event.persisted) void check(); });
  window.addEventListener('focus', () => { void check(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.SFI_APP_UPDATE = { check };
  void check();
})();
