import { validateConnection } from './connection.js';
import { normalizeText } from './matching.js';

const KAHOOT_HOSTS = new Set(['kahoot.it', 'create.kahoot.it', 'play.kahoot.it']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_TTL = 60_000;
const SEARCH_RETRY_DELAY = 10_000;
const CACHE_LIMIT = 64;
const quizCache = new Map();
const searchCache = new Map();

function metadataOnly(value, allowRevealedAnswer, allowObservedQuestion) {
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
  const observed = value?.observedQuestion;
  if (allowObservedQuestion && typeof observed?.question === 'string' && observed.question.trim() &&
      observed.question.length <= 1200 && typeof observed.roundId === 'string' && observed.roundId.trim() &&
      Array.isArray(observed.choices) && observed.choices.length >= 2 && observed.choices.length <= 20 &&
      observed.choices.every(choice => typeof choice === 'string' && choice.trim() && choice.length <= 2000)) {
    metadata.observedQuestion = {
      question: observed.question.trim(), choices: observed.choices.map(choice => choice.trim()),
      roundId: observed.roundId.trim().slice(0, 10)
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

function rememberQuiz(key, quiz, source) {
  quizCache.delete(key);
  quizCache.set(key, { quiz, source, expiresAt: Date.now() + CACHE_TTL });
  while (quizCache.size > CACHE_LIMIT) quizCache.delete(quizCache.keys().next().value);
}

function quizCacheKey(tabId, quizId, connection) {
  return JSON.stringify([tabId, quizId.toLowerCase(), connection.baseUrl, connection.token]);
}

function choiceTexts(values) {
  const texts = values.map(normalizeText);
  const boolean = new Map([['true', '@true'], ['vrai', '@true'], ['false', '@false'], ['faux', '@false']]);
  const pair = texts.map(text => boolean.get(text));
  return texts.length === 2 && pair.every(Boolean) && new Set(pair).size === 2 ? pair.sort() : texts.sort();
}

function questionSignature(observed, questionCount) {
  return JSON.stringify([normalizeText(observed.question), choiceTexts(observed.choices), questionCount]);
}

function matchingObservedQuestion(quiz, observed, questionCount, requireCorrections = false) {
  if (!Array.isArray(quiz?.questions) || !quiz.questions.length || quiz.questions.length > 500) return false;
  const total = quiz.questions.length + (Number(quiz.slideCount) || 0) + (Number(quiz.skippedCount) || 0);
  if (questionCount && total !== questionCount) return false;
  const text = normalizeText(observed.question);
  const questions = quiz.questions.filter(question => typeof question?.question === 'string' && normalizeText(question.question) === text);
  // The live decision maker also requires one unambiguous exact question.
  if (!text || questions.length !== 1) return false;
  const choices = questions[0].choices;
  if (!Array.isArray(choices) || choices.length !== observed.choices.length ||
      choices.some(choice => typeof choice?.text !== 'string' || !normalizeText(choice.text))) return false;
  const source = choiceTexts(choices.map(choice => choice.text));
  const received = choiceTexts(observed.choices);
  if (received.some((choice, index) => !choice || choice !== source[index])) return false;
  return !requireCorrections || (new Set(source).size === source.length &&
    choices.every(choice => typeof choice.correct === 'boolean') && choices.some(choice => choice.correct));
}

async function searchObservedQuestion(connection, tabId, metadata, knownQuizId) {
  const observed = metadata.observedQuestion;
  if (typeof knownQuizId === 'string' && UUID.test(knownQuizId)) {
    const key = quizCacheKey(tabId, knownQuizId, connection);
    const known = cachedQuiz(key);
    if (known && matchingObservedQuestion(known, observed, metadata.questionCount)) {
      const source = quizCache.get(key)?.source;
      return { ok: true, quiz: null, ...(source ? { source, searchStatus: 'matched' } : {}) };
    }
  }
  const key = JSON.stringify([tabId, connection.baseUrl, connection.token, questionSignature(observed, metadata.questionCount)]);
  const now = Date.now();
  for (const [entryKey, entry] of searchCache) if (entry.expiresAt <= now) searchCache.delete(entryKey);
  const cached = searchCache.get(key);
  if (cached) {
    searchCache.delete(key);
    searchCache.set(key, cached);
    return cached.pending || cached.result;
  }
  const entry = { expiresAt: Infinity, pending: null };
  const pending = (async () => {
    let result;
    try {
      const payload = { question: observed.question, choices: observed.choices };
      if (metadata.questionCount) payload.questionCount = metadata.questionCount;
      const response = await fetch(`${connection.baseUrl}/bridge/search-quiz`, {
        method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(60000)
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Code de connexion expiré. Recopie-le depuis Ez-Kahoot.');
      }
      const unmatched = (searchStatus, discoveryMessage) => ({ ok: true, quiz: null, source: 'public-search', searchStatus, discoveryMessage });
      if (response.status === 404) {
        result = unmatched('not-found', 'Aucun candidat confirmé parmi les résultats publics vérifiés.');
      } else if (response.status === 409) {
        result = unmatched('ambiguous', 'Plusieurs quiz correspondent à cette question ; corrigé non confirmé.');
      } else {
        if (!response.ok) throw new Error('La recherche du quiz public est indisponible.');
        let data;
        try { data = await response.json(); } catch { throw new Error('Le serveur local a renvoyé un corrigé illisible.'); }
        const quiz = data?.quiz;
        if (data?.source !== 'public-search' || typeof quiz?.id !== 'string' || !UUID.test(quiz.id) ||
            !matchingObservedQuestion(quiz, observed, metadata.questionCount, true)) {
          result = unmatched('ambiguous', 'Le corrigé trouvé ne confirme pas exactement la question et ses propositions.');
        } else {
          rememberQuiz(quizCacheKey(tabId, quiz.id, connection), quiz, 'public-search');
          result = { ok: true, quiz, source: 'public-search', searchStatus: 'matched', discoveryMessage: 'Corrigé candidat trouvé par la question, vérifié avec ses propositions.' };
        }
      }
    } catch (error) {
      result = { ok: false, error: error instanceof Error && /^(?:Code de connexion|La recherche|Le serveur local)/.test(error.message)
        ? error.message : 'Serveur local inaccessible. Lance Ez-Kahoot puis reconnecte le compagnon.' };
    }
    entry.pending = null;
    entry.result = result;
    entry.expiresAt = Date.now() + (result.quiz ? CACHE_TTL : SEARCH_RETRY_DELAY);
    return result;
  })();
  entry.pending = pending;
  searchCache.set(key, entry);
  while (searchCache.size > CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value);
  return pending;
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
    metadata = metadataOnly(execution[0]?.result, /^\/answer\/results?\/?$/.test(url.pathname),
      /^(?:\/(?:v2\/)?gameblock|\/answer\/results?)\/?$/.test(url.pathname));
    if (!metadata.quizId) {
      if (!metadata.observedQuestion || (message?.knownQuizMatchesObserved === true &&
          typeof message.knownQuizId === 'string' && message.knownQuizId.trim() && message.knownQuizId.length <= 200)) {
        return { ok: true, metadata, quiz: null };
      }
      const stored = await chrome.storage.local.get('ezkConnection');
      const connection = validateConnection(stored.ezkConnection);
      return { ...await searchObservedQuestion(connection, sender.tab.id, metadata, message?.knownQuizId), metadata };
    }
    if (typeof message?.knownQuizId === 'string' &&
        message.knownQuizId.toLowerCase() === metadata.quizId) {
      return { ok: true, metadata, quiz: null };
    }
    const stored = await chrome.storage.local.get('ezkConnection');
    const connection = validateConnection(stored.ezkConnection);
    const cacheKey = quizCacheKey(sender.tab.id, metadata.quizId, connection);
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
