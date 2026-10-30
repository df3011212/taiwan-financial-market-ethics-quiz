(function (global) {
  'use strict';
  const KEY = 'sfi-similarity-tracking-v1';
  const MAX_QUESTIONS = 5000, MAX_GROUPS = 5000, MAX_ATTEMPT_IDS = 40;
  const MAX_COUNT = 1000000000;
  let storageAvailable = true;
  let state = {version: 1, questions: Object.create(null), tracked: []};

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 120 &&
      !/[\u0000-\u001f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  }
  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
  }
  function emptyQuestion() {
    return {attempts: 0, correct: 0, wrong: 0, streak: 0,
      lastAnswer: null, lastCorrect: null, lastAt: null, attemptIds: []};
  }
  function sanitizeQuestion(value) {
    if (!isObject(value) || !['attempts','correct','wrong','streak'].every(key => validCount(value[key]))) return null;
    if (value.attempts !== value.correct + value.wrong || value.streak > value.correct) return null;
    if (value.attempts === 0) return emptyQuestion();
    if (![1,2,3,4].includes(value.lastAnswer) || typeof value.lastCorrect !== 'boolean' ||
      (!value.lastCorrect && value.streak !== 0) || (value.lastCorrect && value.streak < 1)) return null;
    if (typeof value.lastAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.lastAt) ||
      !Number.isFinite(Date.parse(value.lastAt)) || value.lastAt.length > 40) return null;
    if (!Array.isArray(value.attemptIds) || value.attemptIds.length > MAX_ATTEMPT_IDS ||
      value.attemptIds.some(id => typeof id !== 'string' || !id.length || id.length > 160)) return null;
    return {attempts: value.attempts, correct: value.correct, wrong: value.wrong,
      streak: value.streak, lastAnswer: value.lastAnswer, lastCorrect: value.lastCorrect,
      lastAt: new Date(value.lastAt).toISOString(), attemptIds: [...new Set(value.attemptIds)]};
  }
  function sanitizeData(value) {
    if (!isObject(value) || value.version !== 1 || !isObject(value.questions) || !Array.isArray(value.tracked)) {
      return {error: '不是有效的相似題集追蹤備份（需為版本 1）。'};
    }
    const entries = Object.entries(value.questions);
    if (entries.length > MAX_QUESTIONS || value.tracked.length > MAX_GROUPS) return {error: '備份資料筆數超過上限。'};
    const questions = Object.create(null);
    for (const [id, record] of entries) {
      const clean = sanitizeQuestion(record);
      if (!validId(id) || !clean) return {error: '備份中含有無效的題目紀錄。'};
      questions[id] = clean;
    }
    if (value.tracked.some(id => !validId(id))) return {error: '備份中含有無效的追蹤群組。'};
    return {data: {version: 1, questions, tracked: [...new Set(value.tracked)]}};
  }
  function persist() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      storageAvailable = true;
    } catch (_) { storageAvailable = false; }
  }
  try {
    const raw = global.localStorage.getItem(KEY);
    if (raw) {
      if (raw.length > 10000000) throw new Error('Oversized tracking data');
      const clean = sanitizeData(JSON.parse(raw));
      if (clean.data) state = clean.data;
    }
  } catch (_) { storageAvailable = false; }

  const api = {
    record(questionId, selectedAnswer, correctAnswer, attemptId) {
      if (!validId(questionId) || ![1,2,3,4].includes(selectedAnswer) ||
        ![1,2,3,4].includes(correctAnswer) || typeof attemptId !== 'string' || !attemptId.trim()) return false;
      const id = attemptId.trim().slice(0, 160);
      const previous = state.questions[questionId];
      if (previous?.attemptIds.includes(id) || (previous?.attempts || 0) >= MAX_COUNT) return false;
      if (!previous && Object.keys(state.questions).length >= MAX_QUESTIONS) return false;
      const record = previous || emptyQuestion();
      const correct = selectedAnswer === correctAnswer;
      record.attempts++;
      record[correct ? 'correct' : 'wrong']++;
      record.streak = correct ? record.streak + 1 : 0;
      record.lastAnswer = selectedAnswer;
      record.lastCorrect = correct;
      record.lastAt = new Date().toISOString();
      record.attemptIds = [...record.attemptIds, id].slice(-MAX_ATTEMPT_IDS);
      state.questions[questionId] = record;
      persist();
      return true;
    },
    question(id) {
      const {attemptIds, ...summary} = validId(id) && state.questions[id] || emptyQuestion();
      return {...summary};
    },
    stats(questionIds) {
      const ids = [...new Set(Array.isArray(questionIds) ? questionIds.filter(validId) : [])];
      const result = {total: ids.length, seen: 0, attempts: 0, correct: 0, wrong: 0,
        accuracy: null, pending: ids.length, mastered: 0, lastAt: null};
      for (const id of ids) {
        const record = state.questions[id];
        if (!record) continue;
        if (record.attempts) result.seen++;
        result.attempts += record.attempts;
        result.correct += record.correct;
        result.wrong += record.wrong;
        if (record.streak >= 2) result.mastered++;
        if (record.lastAt && (!result.lastAt || record.lastAt > result.lastAt)) result.lastAt = record.lastAt;
      }
      result.pending -= result.mastered;
      if (result.attempts) result.accuracy = Math.round(result.correct / result.attempts * 100);
      return result;
    },
    toggleGroup(groupId) {
      if (!validId(groupId)) return false;
      const index = state.tracked.indexOf(groupId);
      if (index >= 0) state.tracked.splice(index, 1);
      else if (state.tracked.length < MAX_GROUPS) state.tracked.push(groupId);
      else return false;
      persist();
      return state.tracked.includes(groupId);
    },
    isTracked(groupId) { return state.tracked.includes(groupId); },
    trackedIds() { return state.tracked.slice(); },
    exportData() { return JSON.parse(JSON.stringify(state)); },
    importData(value) {
      const clean = sanitizeData(value);
      if (!clean.data) return {ok: false, imported: 0, tracked: 0, error: clean.error};
      const mergedIds = new Set([...Object.keys(state.questions), ...Object.keys(clean.data.questions)]);
      const tracked = [...new Set([...state.tracked, ...clean.data.tracked])];
      if (mergedIds.size > MAX_QUESTIONS || tracked.length > MAX_GROUPS) {
        return {ok: false, imported: 0, tracked: 0, error: '合併後的資料筆數超過上限。'};
      }
      let imported = 0;
      for (const [id, record] of Object.entries(clean.data.questions)) {
        const current = state.questions[id];
        if (!current || (record.lastAt || '') > (current.lastAt || '') ||
          (record.lastAt === current.lastAt && record.attempts > current.attempts)) {
          state.questions[id] = record;
          imported++;
        }
      }
      const added = tracked.length - state.tracked.length;
      state.tracked = tracked;
      persist();
      return {ok: true, imported, tracked: added};
    }
  };
  Object.defineProperty(api, 'storageAvailable', {enumerable: true, get: () => storageAvailable});
  global.SFI_TRACKER = api;
})(window);
