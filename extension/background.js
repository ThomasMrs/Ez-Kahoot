import { validateConnection } from './connection.js';

const KAHOOT_HOSTS = new Set(['kahoot.it', 'create.kahoot.it', 'play.kahoot.it']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_TTL = 60_000;
const CACHE_LIMIT = 64;
const quizCache = new Map();

function metadataOnly(value, allowRevealedAnswer) {
  const count = value?.questionCount;
  const metadata = {
    quizId: typeof value?.quizId === 'string' && UUID.test(value.quizId) ? value.quizId.toLowerCase() : null,
    title: typeof value?.title === 'string' ? value.title.slice(0, 300) : '',
    questionCount: Number.isInteger(count) && count > 0 && count <= 500 ? count : null
  };
  const revealed = value?.revealedAnswer;
  if (allowRevealedAnswer && revealed?.phase === 'result' && typeof revealed.roundId === 'string' &&
      revealed.roundId.trim() && typeof revealed.question === 'string' &&
      Array.isArray(revealed.answers) && revealed.answers.length > 0 && revealed.answers.length <= 20 &&
      revealed.answers.every(answer => typeof answer?.text === 'string' && answer.text.trim() && answer.text.length <= 2000)) {
    metadata.revealedAnswer = {
      phase: 'result', roundId: revealed.roundId.trim().slice(0, 10), question: revealed.question.slice(0, 1200),
      answers: revealed.answers.map(answer => ({ text: answer.text.trim() }))
    };
  }
  return metadata;
}

function cachedQuiz(key) {
  const now = Date.now();
  for (const [entryKey, entry] of quizCache) if (entry.expiresAt <= now) quizCache.delete(entryKey);
  const entry = quizCache.get(key);
  if (!entry) return null;
  // Retain recently used quizzes when the bounded cache is full.
  quizCache.delete(key);
  quizCache.set(key, entry);
  return entry.quiz;
}

function rememberQuiz(key, quiz) {
  quizCache.delete(key);
  quizCache.set(key, { quiz, expiresAt: Date.now() + CACHE_TTL });
  while (quizCache.size > CACHE_LIMIT) quizCache.delete(quizCache.keys().next().value);
}

export async function discoverForTab(message, sender) {
  let metadata = null;
  try {
    let url;
    try { url = new URL(sender?.tab?.url || ''); } catch { /* Reject restricted senders below. */ }
    if (!Number.isInteger(sender?.tab?.id) || sender.tab.id < 0 || !url ||
        url.protocol !== 'https:' || !KAHOOT_HOSTS.has(url.hostname)) {
      throw new Error('La recherche doit partir de ton onglet Kahoot.');
    }
    let execution;
    try {
      execution = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id }, world: 'MAIN', files: ['probe-runtime.js']
      });
    } catch {
      throw new Error('Les informations de la page ne sont pas lisibles. Réouvre le panneau depuis l’extension.');
    }
    metadata = metadataOnly(execution[0]?.result, /^\/answer\/results?\/?$/.test(url.pathname));
    if (!metadata.quizId || (typeof message?.knownQuizId === 'string' &&
        message.knownQuizId.toLowerCase() === metadata.quizId)) {
      return { ok: true, metadata, quiz: null };
    }
    const stored = await chrome.storage.local.get('ezkConnection');
    const connection = validateConnection(stored.ezkConnection);
    const cacheKey = `${sender.tab.id}:${metadata.quizId}:${connection.baseUrl}:${connection.token}`;
    const cached = cachedQuiz(cacheKey);
    if (cached) return { ok: true, metadata, quiz: cached };
    let response;
    try {
      response = await fetch(`${connection.baseUrl}/bridge/quiz?input=${encodeURIComponent(metadata.quizId)}`, {
        method: 'GET', headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/json' },
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000)
      });
    } catch {
      throw new Error('Serveur local inaccessible. Lance Ez-Kahoot puis reconnecte le compagnon.');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Code de connexion expiré. Recopie-le depuis Ez-Kahoot.');
      if (response.status === 404) throw new Error('Le quiz détecté est introuvable ou privé.');
      throw new Error('Le corrigé du quiz détecté n’a pas pu être chargé.');
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('Le serveur local a renvoyé un corrigé illisible.'); }
    const quiz = data?.quiz || data;
    if (!Array.isArray(quiz?.questions) || !quiz.questions.length || quiz.questions.length > 500) {
      throw new Error('Le document détecté ne contient pas de quiz exploitable.');
    }
    rememberQuiz(cacheKey, quiz);
    return { ok: true, metadata, quiz };
  } catch (error) {
    const response = { ok: false, error: error instanceof Error ? error.message : 'Recherche du quiz indisponible.' };
    if (metadata) response.metadata = metadata;
    return response;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'EZK_DISCOVER') return false;
  discoverForTab(message, sender).then(sendResponse);
  return true;
});
