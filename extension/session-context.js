import { addObservation, roundNumber } from './observations.js';

const sessions = new Map();
export async function getSession(tabId) {
  const cached = sessions.get(tabId);
  if (cached && Date.now() - cached.updatedAt < 10 * 60_000) return cached;
  sessions.delete(tabId);
  const key = `ezkTab:${tabId}`;
  const stored = chrome.storage.session ? (await chrome.storage.session.get(key))[key] : null;
  const session = stored && Date.now() - stored.updatedAt < 10 * 60_000 ? stored : { history: [], quizId: null, selectedId: null, updatedAt: Date.now() };
  sessions.set(tabId, session);
  while (sessions.size > 32) await forgetSession(sessions.keys().next().value);
  return session;
}

export async function saveSession(tabId, session) {
  session.updatedAt = Date.now();
  if (chrome.storage.session) await chrome.storage.session.set({ [`ezkTab:${tabId}`]: session });
}

export async function observeSession(tabId, metadata, path) {
  const session = await getSession(tabId);
  const currentRound = Number(roundNumber(metadata.observedQuestion?.roundId)) || 0;
  if (Date.now() - (session.updatedAt || 0) > 10 * 60_000 || /\/(?:join|lobby)(?:\/|$)/.test(path) ||
      (metadata.quizId && session.quizId && metadata.quizId !== session.quizId) ||
      (currentRound && session.round && currentRound < session.round)) {
    session.history = [];
    session.round = 0;
    session.quizId = null;
  }
  if (metadata.quizId) session.quizId = metadata.quizId;
  if (currentRound) session.round = currentRound;
  if (metadata.observedQuestion) session.history = addObservation(session.history, metadata.observedQuestion);
  await saveSession(tabId, session);
  return session;
}

export async function forgetSession(tabId) {
  sessions.delete(tabId);
  if (chrome.storage.session) await chrome.storage.session.remove(`ezkTab:${tabId}`);
}
