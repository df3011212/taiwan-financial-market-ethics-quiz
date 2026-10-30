/* Similar-answer and similar-question collections. Uses the original question bank unchanged. */
(() => {
  'use strict';
  const tracker = window.SFI_TRACKER;
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
  const customKey = 'sfi-similarity-custom-v1';
  const escape = value => escapeHtml(String(value ?? ''));
  let custom = [];
  try { custom = validateCustom(JSON.parse(localStorage.getItem(customKey) || '[]')); } catch {}
  const state = { kind: 'answers', selected: null, page: 0, showAnswers: true, focusQuestion: null, returnToQuiz: false };
  const perPage = 8;
  const section = document.createElement('section');
  section.id = 'similarity';
  section.className = 'panel hidden';
  section.innerHTML = `
    <div class="similarity-heading"><div><div class="brand">COMPARE · PRACTICE · TRACK</div><h2>易混淆題目整理與追蹤</h2><p>答案名稱很像，集中比較；題幹很像，並排看差別。</p></div><button class="button ghost" id="similarityBack">返回練習設定</button></div>
    <div class="similarity-tabs" role="group" aria-label="相似集合種類"><button class="button secondary" data-sim-tab="answers">相似答案集</button><button class="button secondary" data-sim-tab="questions">相似題目集</button><button class="button secondary" data-sim-tab="tracked">我的追蹤</button></div>
    <p class="similarity-notice" id="similarityExplanation"></p>
    <div id="similaritySummary" class="similarity-summary" aria-live="polite"></div>
    <div class="similarity-filters"><div class="field"><label for="similaritySearch">搜尋名稱、選項或題目內容</label><input id="similaritySearch" type="search" placeholder="例如：市場、銀行局、保險、期限"></div><div class="field"><label for="similaritySubject">考科</label><select id="similaritySubject"><option value="all">全部考科</option><option>金融市場常識</option><option>職業道德</option></select></div><div class="field"><label for="similarityStatus">複習狀態</label><select id="similarityStatus"><option value="all">全部狀態</option><option value="pending">還有待複習題目</option><option value="wrong">曾經答錯</option><option value="mastered">全組已熟悉</option></select></div></div>
    <div id="similarityFocus" class="similarity-context"></div>
    <div class="similarity-layout"><div><div class="hint" id="similarityCount" role="status"></div><div id="similarityGroups" class="similarity-group-list"></div><div class="similarity-pager"><button class="button ghost" id="similarityPrev">← 上頁</button><span class="hint" id="similarityPage"></span><button class="button ghost" id="similarityNext">下頁 →</button></div></div><div id="similarityDetail" class="similarity-detail" tabindex="-1"></div></div>
    <div class="similarity-tools"><div class="actions"><button class="button secondary" id="similarityCustomToggle">建立自訂分組</button><button class="button ghost" id="similarityExport">匯出追蹤備份</button><button class="button ghost" id="similarityImport">匯入追蹤備份</button><input id="similarityImportFile" type="file" accept="application/json,.json" class="hidden"></div><p class="hint">每題連續答對 2 次視為已熟悉；其餘列入待複習。一般練習與交卷也會累計。聽題不計入答對率，統計從本功能開始使用後累計。原錯題清單照常保留。進度儲存在此瀏覽器，建議定期匯出備份。</p><div id="similarityStorage" class="hint"></div><div id="similarityMessage" class="similarity-feedback" role="status"></div></div>
    <form id="similarityCustom" class="similarity-custom hidden"><h3>把你覺得容易看混的題目放在一起</h3><div class="similarity-custom-grid"><div class="field"><label for="similarityCustomName">分組名稱</label><input id="similarityCustomName" maxlength="80" placeholder="例如：都是 XX 市場" required></div><div class="field"><label for="similarityCustomKind">集合種類</label><select id="similarityCustomKind"><option value="answers">相似答案</option><option value="questions">相似題目</option></select></div><div class="field"><label for="similarityCustomSubject">考科</label><select id="similarityCustomSubject"><option>金融市場常識</option><option>職業道德</option></select></div><div class="field wide-field"><label for="similarityCustomNumbers">題庫題號（至少 2 題，用逗號分隔，也可用 7-12）</label><input id="similarityCustomNumbers" placeholder="例如：15,17,19,20" maxlength="2000" required></div></div><div class="actions"><button class="button" type="submit">建立並追蹤</button><button class="button ghost" type="button" id="similarityCustomCancel">取消</button></div><p id="similarityCustomError" class="hint" role="alert"></p></form>`;
  $('study').before(section);
  for (const [kind, label] of [['answers', '相似答案集'], ['questions', '相似題目集']]) {
    const button = document.createElement('button');
    button.className = 'button secondary'; button.textContent = label;
    button.id = kind === 'answers' ? 'openSimilarAnswers' : 'openSimilarQuestions';
    button.onclick = () => open(kind);
    $('openBank').parentElement.insertBefore(button, $('available'));
  }

  function validateCustom(input) {
    if (!Array.isArray(input) || input.length > 200) throw new Error('自訂分組格式不正確或超過 200 組');
    const ids = new Set();
    return input.map(group => {
      if (!group || typeof group.id !== 'string' || !/^custom-[\w-]{1,100}$/.test(group.id) || ids.has(group.id) || !['answers', 'questions'].includes(group.kind) || typeof group.title !== 'string' || !group.title.trim() || group.title.length > 80 || !Array.isArray(group.questionIds)) throw new Error('自訂分組格式不正確');
      ids.add(group.id);
      const questionIds = [...new Set(group.questionIds)].filter(id => byId.has(id));
      if (questionIds.length < 2 || questionIds.length > 1120) throw new Error('每組需要至少 2 題有效題目');
      return { id: group.id, kind: group.kind, title: group.title.trim(), description: '自行整理的易混淆題目。', questionIds, custom: true };
    });
  }
  function allGroups() { return [...(window.SFI_SIMILARITY?.groups || []), ...custom]; }
  function questionsFor(group) { return group.questionIds.map(id => byId.get(id)).filter(Boolean); }
  function matchingGroups(qid, kind) { return allGroups().filter(group => (!kind || group.kind === kind) && group.questionIds.includes(qid)); }
  function label(kind) { return kind === 'answers' ? '相似答案' : '相似題目'; }
  function message(text) { $('similarityMessage').textContent = text; }
  function saveCustom() { try { localStorage.setItem(customKey, JSON.stringify(custom)); return true; } catch { message('瀏覽器無法保存自訂分組，請匯出備份。'); return false; } }
  function selectedGroup() { return allGroups().find(group => group.id === state.selected); }
  function idsForStats(groups) { return [...new Set(groups.flatMap(group => questionsFor(group).filter(q => $('similaritySubject').value === 'all' || q.section === $('similaritySubject').value).map(q => q.id)))]; }
  function filteredGroups() {
    const needle = $('similaritySearch').value.trim().toLowerCase();
    return allGroups().filter(group => {
      if (state.kind === 'tracked' ? !tracker.isTracked(group.id) : group.kind !== state.kind) return false;
      if (state.focusQuestion && !group.questionIds.includes(state.focusQuestion)) return false;
      const qs = questionsFor(group).filter(q => $('similaritySubject').value === 'all' || q.section === $('similaritySubject').value);
      if (!qs.length) return false;
      if (needle && ![group.title, group.description, ...(group.terms || []), ...qs.map(q => q.text)].join(' ').toLowerCase().includes(needle)) return false;
      const stats = tracker.stats(qs.map(q => q.id)), filter = $('similarityStatus').value;
      return filter === 'all' || filter === 'pending' && stats.pending > 0 || filter === 'wrong' && stats.wrong > 0 || filter === 'mastered' && stats.mastered === stats.total;
    });
  }
  function open(kind = 'answers', qid = null, groupId = null, fromQuiz = false) {
    clearTimeout(advanceTimer); window.speechSynthesis?.cancel();
    state.kind = kind; state.focusQuestion = qid; state.returnToQuiz = fromQuiz; state.page = 0; state.selected = groupId;
    $('similaritySearch').value = ''; $('similaritySubject').value = 'all'; $('similarityStatus').value = 'all';
    if (groupId) { const index = filteredGroups().findIndex(group => group.id === groupId); if (index >= 0) state.page = Math.floor(index / perPage); }
    ['setup', 'bank', 'study', 'result'].forEach(id => $(id).classList.add('hidden'));
    $('shell').classList.remove('wide'); $('shell').classList.add('similarity-wide'); section.classList.remove('hidden');
    $('similarityBack').textContent = fromQuiz ? '返回目前練習' : '返回練習設定';
    render(); section.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  function close() {
    section.classList.add('hidden'); $('shell').classList.remove('similarity-wide');
    if (state.returnToQuiz && session) { $('study').classList.remove('hidden'); if (!$('pdfPanel').classList.contains('hidden')) $('shell').classList.add('wide'); renderQuestion(); if (session.mode === 'listen') speakCurrent(); }
    else { $('setup').classList.remove('hidden'); updateAvailable(); }
  }
  function render() {
    const groups = filteredGroups();
    if (!groups.some(group => group.id === state.selected)) state.selected = groups[0]?.id || null;
    const selectedIndex = groups.findIndex(group => group.id === state.selected);
    state.page = Math.max(0, Math.min(state.page, Math.max(0, Math.ceil(groups.length / perPage) - 1)));
    if (selectedIndex >= 0 && (selectedIndex < state.page * perPage || selectedIndex >= (state.page + 1) * perPage)) state.selected = groups[state.page * perPage]?.id || null;
    document.querySelectorAll('[data-sim-tab]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.simTab === state.kind)); button.textContent = `${button.dataset.simTab === 'tracked' ? '我的追蹤' : label(button.dataset.simTab) + '集'}（${allGroups().filter(group => button.dataset.simTab === 'tracked' ? tracker.isTracked(group.id) : group.kind === button.dataset.simTab).length}）`; });
    $('similarityExplanation').textContent = state.kind === 'answers' ? '把名稱、字樣或選項組合很像的題目集中整理，例如：第 15、17、19、20 題的選項都是「XX 市場」。先看題目線索，再比較容易選混的答案。' : state.kind === 'questions' ? '依具體觀念或相近題幹分組，並排看問法、條件與正反問句。文字相似分組為輔助整理，請逐題判讀。' : '你主動追蹤的兩種集合都在這裡；任何模式的已確認作答或交卷都會更新進度。';
    const summary = tracker.stats(idsForStats(groups));
    $('similaritySummary').innerHTML = [[groups.length, '符合分組'], [`${summary.seen} / ${summary.total}`, '已練題目（去重）'], [summary.accuracy === null ? '—' : `${summary.accuracy}%`, `累計答對率・${summary.attempts} 次`], [summary.pending, '待複習題目']].map(([value, title]) => `<div class="similarity-metric"><strong>${value}</strong><span>${escape(title)}</span></div>`).join('');
    $('similarityFocus').innerHTML = state.focusQuestion ? `正在看 ${escape(byId.get(state.focusQuestion)?.section)} 第 ${byId.get(state.focusQuestion)?.number} 題的相關分組　<button class="button ghost" id="similarityClearFocus">查看全部分組</button>` : '';
    $('similarityClearFocus')?.addEventListener('click', () => { state.focusQuestion = null; state.page = 0; render(); });
    $('similarityCount').textContent = `共 ${groups.length} 組${state.kind === 'tracked' ? '已追蹤' : ''}`;
    $('similarityGroups').innerHTML = groups.slice(state.page * perPage, (state.page + 1) * perPage).map(group => {
      const stats = tracker.stats(questionsFor(group).filter(q => $('similaritySubject').value === 'all' || q.section === $('similaritySubject').value).map(q => q.id));
      return `<button class="similarity-group" data-sim-group="${escape(group.id)}" aria-current="${state.selected === group.id}"><span class="similarity-section-label">${label(group.kind)}${tracker.isTracked(group.id) ? '・★ 追蹤中' : ''}${group.custom ? '・自訂' : ''}</span><strong>${escape(group.title)}</strong><small>${stats.total} 題・已練 ${stats.seen}・已熟悉 ${stats.mastered}<br>答對率 ${stats.accuracy === null ? '尚未練習' : stats.accuracy + '%'}・曾答錯 ${stats.wrong} 次</small><div class="track"><span style="width:${stats.total ? stats.mastered / stats.total * 100 : 0}%"></span></div></button>`;
    }).join('') || '<div class="similarity-empty">沒有符合的分組。可調整篩選，或建立自訂分組。</div>';
    $('similarityPrev').disabled = state.page === 0; $('similarityNext').disabled = (state.page + 1) * perPage >= groups.length;
    $('similarityPage').textContent = groups.length ? `${state.page + 1} / ${Math.ceil(groups.length / perPage)}` : '0 / 0';
    $('similarityStorage').textContent = tracker.storageAvailable ? '' : '目前瀏覽器無法儲存進度，關閉頁面前請先匯出備份。';
    renderDetail();
  }
  function renderDetail() {
    const group = selectedGroup();
    if (!group) { $('similarityDetail').innerHTML = '<div class="similarity-empty">選擇左側分組，就能比較題目、答案與作答紀錄。</div>'; return; }
    const qs = questionsFor(group).filter(q => $('similaritySubject').value === 'all' || q.section === $('similaritySubject').value), stats = tracker.stats(qs.map(q => q.id));
    const table = group.contrasts?.length ? `<div class="similarity-table-wrap"><table class="similarity-table"><thead><tr><th scope="col">易混淆名稱</th><th scope="col">辨認線索</th></tr></thead><tbody>${group.contrasts.map(item => `<tr><td>${escape(item.term)}</td><td>${escape(item.clue)}</td></tr>`).join('')}</tbody></table></div>` : '';
    const answerBuckets = new Map();
    for (const q of qs) { const answer = choices(q.text)[q.answer], key = answer.normalize('NFKC').replace(/\s+/g, ''); if (!answerBuckets.has(key)) answerBuckets.set(key, { answer, qs: [] }); answerBuckets.get(key).qs.push(q); }
    const overview = `<details class="similarity-overview"><summary>展開本組答案速覽（依正確答案整理）</summary><div class="similarity-table-wrap"><table class="similarity-table"><thead><tr><th scope="col">正確答案</th><th scope="col">對應題目</th></tr></thead><tbody>${[...answerBuckets.values()].map(bucket => `<tr><td>${escape(bucket.answer)}</td><td>${bucket.qs.map(q => `<button class="button ghost" data-sim-jump="${escape(q.id)}">${q.section === '金融市場常識' ? '金融' : '道德'} ${q.number}</button>`).join(' ')}</td></tr>`).join('')}</tbody></table></div></details>`;
    $('similarityDetail').innerHTML = `<span class="similarity-match">${label(group.kind)}${group.custom ? '・自訂分組' : '・輔助整理'}</span><h3>${escape(group.title)}</h3>${state.showAnswers ? overview : ""}<p class="hint">${escape(group.description)}</p><div class="actions"><button class="button secondary" id="similarityTrack" aria-pressed="${tracker.isTracked(group.id)}">${tracker.isTracked(group.id) ? '★ 已追蹤・點此取消' : '☆ 追蹤這一組'}</button><button class="button ghost" id="similarityReveal" aria-pressed="${state.showAnswers}">${state.showAnswers ? '隱藏答案與提示' : '顯示答案與提示'}</button></div>${state.showAnswers ? table : ''}<p class="hint">已練 ${stats.seen} / ${stats.total} 題・已熟悉 ${stats.mastered} 題・累計答對 ${stats.correct} / ${stats.attempts} 次${stats.lastAt ? '・最近練習 ' + escape(new Date(stats.lastAt).toLocaleString('zh-TW')) : ''}</p><div class="actions"><button class="button" data-sim-practice="all">練習本組 ${qs.length} 題 →</button><button class="button secondary" data-sim-practice="pending" ${stats.pending ? '' : 'disabled'}>只練待複習 ${stats.pending} 題</button></div><p class="hint">練習時會先隱藏答案，每次練習的作答紀錄獨立計算。</p><div>${qs.map(q => questionCard(q, group)).join('')}</div>`;
    $('similarityTrack').onclick = () => { tracker.toggleGroup(group.id); render(); };
    $('similarityReveal').onclick = () => { state.showAnswers = !state.showAnswers; renderDetail(); };
    $('similarityDetail').querySelectorAll('[data-sim-jump]').forEach(button => button.onclick = () => $('sim-card-' + button.dataset.simJump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $('similarityDetail').querySelectorAll('[data-sim-practice]').forEach(button => button.onclick = () => practice(group, button.dataset.simPractice === 'pending'));
    $('similarityDetail').querySelectorAll('[data-sim-single]').forEach(button => button.onclick = () => practice(group, false, button.dataset.simSingle));
  }
  function questionCard(q, group) {
    const opts = choices(q.text), record = tracker.question(q.id), negative = isNegativeQuestion(q);
    const info = !record.attempts ? '尚未練習' : `${record.attempts} 次・答對 ${record.correct}・答錯 ${record.wrong}・${record.streak >= 2 ? '已熟悉' : '待複習（連對 ' + record.streak + ' / 2 次）'}`;
    return `<article class="similarity-question" id="sim-card-${escape(q.id)}"><div class="bank-card-head"><span class="q-number">${escape(q.section)}・題庫第 ${q.number} 題</span>${negative ? '<span class="bank-tag type">注意否定／錯誤問法</span>' : ''}</div><h4>${highlightPrompt(opts[0])}</h4><div class="similarity-options">${opts.slice(1).map((option, i) => `<div>${LETTERS[i]}　${escape(option)}</div>`).join('')}</div>${state.showAnswers ? `<div class="similarity-answer">正確答案 ${LETTERS[q.answer - 1]}：${escape(opts[q.answer])}</div>` : ''}<div class="similarity-last ${record.attempts && !record.lastCorrect ? 'miss' : ''}">${escape(info)}${state.showAnswers && record.attempts && !record.lastCorrect ? `<br>上次誤選：${LETTERS[record.lastAnswer - 1]}　${escape(opts[record.lastAnswer])}` : ''}</div><div class="actions"><button class="button ghost" data-sim-single="${escape(q.id)}">單題練習</button></div></article>`;
  }
  function practice(group, pending = false, single = null) {
    let qs = questionsFor(group).filter(q => $('similaritySubject').value === 'all' || q.section === $('similaritySubject').value);
    if (pending) qs = qs.filter(q => tracker.question(q.id).streak < 2);
    if (single) qs = qs.filter(q => q.id === single);
    if (!qs.length) return;
    tracker.isTracked(group.id) || tracker.toggleGroup(group.id);
    state.returnToQuiz = false;
    section.classList.add('hidden'); $('shell').classList.remove('similarity-wide', 'wide');
    $('study').classList.remove('hidden'); $('study').classList.add('single-column'); $('pdfPanel').classList.add('hidden');
    startWith(qs); session.similarityGroupId = group.id;
    renderQuestion();
  }

  // One token per actual attempt; check, result, and revisiting a question share it.
  window.recordSimilarityAnswer = function(active, index) {
    if (!active || active.mode === 'listen' || active.answers[index] == null) return;
    const q = active.questions[index]; if (!q) return;
    active.similarityAttemptId ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tracker.record(q.id, active.answers[index], q.answer, `${active.similarityAttemptId}:${q.id}`);
  };
  function openRelated(kind, qid) {
    const beforeSubmit = session?.mode === 'exam' && !session.checked[session.index];
    if (beforeSubmit) return;
    open(kind, qid, null, true);
  }
  const originalRenderQuestion = renderQuestion;
  renderQuestion = function() {
    originalRenderQuestion();
    if (!session) return;
    const q = session.questions[session.index], examHidden = session.mode === 'exam' && !session.checked[session.index];
    const box = document.createElement('div'); box.className = 'similarity-quiz-links';
    box.innerHTML = `<span class="hint">容易和其他題目的選項看混？</span><div class="actions"><button class="button secondary" data-sim-related="answers" ${examHidden ? 'disabled' : ''}>相似答案（${matchingGroups(q.id, 'answers').length} 組）</button><button class="button secondary" data-sim-related="questions" ${examHidden ? 'disabled' : ''}>相似題目（${matchingGroups(q.id, 'questions').length} 組）</button>${session.similarityGroupId ? '<button class="button ghost" id="similarityEndPractice">結束並查看本組追蹤</button>' : ''}</div>${examHidden ? '<span class="hint">測驗交卷後可查看集合對照。</span>' : ''}`;
    $('quiz').append(box);
    box.querySelectorAll('[data-sim-related]').forEach(button => button.onclick = () => openRelated(button.dataset.simRelated, q.id));
    $('similarityEndPractice')?.addEventListener('click', () => { session.questions.forEach((_, i) => recordSimilarityAnswer(session, i)); finishPartial(); });
  };
  function addResultLink() {
    const group = allGroups().find(item => item.id === session?.similarityGroupId);
    if (!group) return;
    const back = document.createElement('button'); back.className = 'button secondary'; back.id = 'similarityResultBack'; back.textContent = '查看本組追蹤 →';
    back.onclick = () => open(group.kind, null, group.id); $('result').querySelector('.actions')?.append(back);
    const again = $('again'); if (again) again.onclick = () => practice(group);
  }
  const originalFinish = finish;
  finish = function() { originalFinish(); addResultLink(); };
  const originalPartial = finishPartial;
  finishPartial = function() { originalPartial(); addResultLink(); };
  const originalStartWith = startWith;
  startWith = function(qs) { const groupId = session?.similarityGroupId; originalStartWith(qs); if (groupId) { session.similarityGroupId = groupId; renderQuestion(); } };
  const originalSegmentInfo = segmentInfo;
  segmentInfo = function(count) { return session?.similarityGroupId ? { hasNext: false } : originalSegmentInfo(count); };

  section.addEventListener('click', event => {
    const button = event.target.closest('[data-sim-group]');
    if (button) { state.selected = button.dataset.simGroup; render(); if (window.innerWidth <= 700) $('similarityDetail').scrollIntoView({ behavior: 'smooth' }); }
  });
  document.querySelectorAll('[data-sim-tab]').forEach(button => button.onclick = () => { state.kind = button.dataset.simTab; state.selected = null; state.page = 0; render(); });
  $('similarityBack').onclick = close;
  for (const id of ['similaritySearch', 'similaritySubject', 'similarityStatus']) $(id).addEventListener(id === 'similaritySearch' ? 'input' : 'change', () => { state.page = 0; state.selected = null; render(); });
  $('similarityPrev').onclick = () => { state.page--; state.selected = null; render(); };
  $('similarityNext').onclick = () => { state.page++; state.selected = null; render(); };
  $('similarityCustomToggle').onclick = () => { $('similarityCustom').classList.toggle('hidden'); if (!$('similarityCustom').classList.contains('hidden')) { $('similarityCustom').scrollIntoView({ behavior: 'smooth' }); $('similarityCustomName').focus(); } };
  $('similarityCustomCancel').onclick = () => $('similarityCustom').classList.add('hidden');
  $('similarityCustom').onsubmit = event => {
    event.preventDefault();
    try {
      if (custom.length >= 200) throw new Error('自訂分組最多 200 組');
      const numbers = new Set(), tokens = $('similarityCustomNumbers').value.trim().split(/[,，、\s]+/);
      for (const token of tokens) {
        if (/^\d+$/.test(token)) numbers.add(Number(token));
        else if (/^\d+[-–]\d+$/.test(token)) { const [a, b] = token.split(/[-–]/).map(Number); if (a < 1 || b < a || b > 616) throw new Error('題號區間不正確'); for (let n = a; n <= b; n++) numbers.add(n); }
        else throw new Error('請使用題號或區間，例如 15,17,19,20 或 7-12');
      }
      const qs = QUESTIONS.filter(q => q.section === $('similarityCustomSubject').value && numbers.has(q.number));
      if (qs.length !== numbers.size || qs.length < 2) throw new Error('請輸入至少 2 個有效且不重複的題庫題號');
      const group = validateCustom([{ id: 'custom-' + (globalThis.crypto?.randomUUID?.() || Date.now()), kind: $('similarityCustomKind').value, title: $('similarityCustomName').value, questionIds: qs.map(q => q.id) }])[0];
      custom.push(group); saveCustom(); tracker.toggleGroup(group.id); $('similarityCustom').classList.add('hidden'); $('similarityCustom').reset(); open(group.kind, null, group.id, state.returnToQuiz);
    } catch (error) { $('similarityCustomError').textContent = error.message; }
  };
  $('similarityExport').onclick = () => {
    const data = { format: 'sfi-similarity-backup', version: 1, exportedAt: new Date().toISOString(), tracking: tracker.exportData(), customGroups: custom };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `易混淆題目追蹤-${new Date().toLocaleDateString('sv-SE')}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('已匯出兩種集合的追蹤紀錄與自訂分組。');
  };
  $('similarityImport').onclick = () => $('similarityImportFile').click();
  $('similarityImportFile').onchange = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('備份超過 5 MB');
      const data = JSON.parse(await file.text());
      if (data.format !== 'sfi-similarity-backup' || data.version !== 1) throw new Error('這不是有效的相似題目追蹤備份');
      const incoming = validateCustom(data.customGroups || []), merged = new Map(custom.map(group => [group.id, group]));
      incoming.forEach(group => { if (!merged.has(group.id)) merged.set(group.id, group); });
      if (merged.size > 200) throw new Error('合併後自訂分組超過 200 組');
      const result = tracker.importData(data.tracking); if (!result.ok) throw new Error(result.error || '追蹤資料格式不正確');
      custom = [...merged.values()]; saveCustom(); render(); message('已合併備份；相同題目保留較新的紀錄，追蹤分組一併保留。');
    } catch (error) { message('匯入失敗：' + error.message); }
    event.target.value = '';
  };
  window.SFI_SIMILARITY_UI = { open, matchingGroups, allGroups };
})();
