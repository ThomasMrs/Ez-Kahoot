import { plainQuizText } from './quiz-text.js';
import { normalizeText } from './matching.js';
import { addObservation, observationKey } from './observations.js';

const API = 'https://create.kahoot.it/rest/kahoots/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map();
let retryAt = 0;

export class PublicQuizError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function memo(key, load) {
  const now = Date.now();
  for (const [id, entry] of cache) if (entry.until <= now) cache.delete(id);
  if (cache.has(key)) return cache.get(key).promise;
  const entry = { until: Infinity };
  entry.promise = Promise.resolve().then(load).then(value => {
    entry.until = Date.now() + 60_000;
    return value;
  }, error => {
    entry.until = Date.now() + 10_000;
    throw error;
  });
  cache.set(key, entry);
  while (cache.size > 64) cache.delete(cache.keys().next().value);
  return entry.promise;
}

async function readJSON(url) {
  if (Date.now() < retryAt) throw new PublicQuizError('Kahoot limite les recherches. Nouvelle tentative dans un instant.', 429);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error',
      cache: 'no-store', signal: AbortSignal.timeout(15_000)
    });
    if (response.status === 429) {
      const value = response.headers.get('Retry-After');
      const seconds = value && /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
      retryAt = Date.now() + Math.max(30, Number.isFinite(seconds) ? seconds : 30) * 1000;
      throw new PublicQuizError('Kahoot limite les recherches. Nouvelle tentative dans un instant.', 429);
    }
    if ([401, 403, 404].includes(response.status)) throw new PublicQuizError('Quiz public introuvable ou inaccessible.', 404);
    if (!response.ok) throw new PublicQuizError('La recherche publique Kahoot est indisponible.');
    if (Number(response.headers.get('Content-Length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new PublicQuizError('Le document public est trop volumineux.', 413);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new PublicQuizError('Le document public est trop volumineux.', 413);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof PublicQuizError) throw error;
    throw new PublicQuizError('Lecture publique impossible. Vérifie Internet puis réessaie.');
  }
}

export function normalizePublicQuiz(data, id, { allowShared = false } = {}) {
  if (!UUID.test(id || '') || !data || typeof data !== 'object' ||
      (data.uuid && String(data.uuid).toLowerCase() !== id.toLowerCase()) ||
      !Array.isArray(data.questions) || !data.questions.length || data.questions.length > 500) {
    throw new PublicQuizError('Document de quiz public invalide.', 400);
  }
  if (!allowShared && data.visibility != null && ![1, '1'].includes(data.visibility)) throw new PublicQuizError('Ce quiz n’est pas public.', 404);
  const text = value => {
    if (value == null) return '';
    if (typeof value !== 'string' || value.length > 20_000) throw new PublicQuizError('Texte du quiz invalide.', 400);
    return plainQuizText(value, 20_000);
  };
  const image = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
    catch { return null; }
  };
  const questions = [];
  let slideCount = 0, skippedCount = 0;
  for (const [index, raw] of data.questions.entries()) {
    if (!raw || typeof raw !== 'object') throw new PublicQuizError('Question publique invalide.', 400);
    if (['content', 'slide'].includes(raw.type)) { slideCount++; continue; }
    if (!['quiz', 'true_false', 'multiple_choice'].includes(raw.type || 'quiz') || !Array.isArray(raw.choices) || raw.choices.length < 2) { skippedCount++; continue; }
    if (raw.choices.length > 20) throw new PublicQuizError('Trop de propositions dans ce quiz.', 400);
    const choices = raw.choices.map(choice => {
      if (!choice || typeof choice !== 'object') throw new PublicQuizError('Proposition publique invalide.', 400);
      const media = image(choice.image);
      return { text: text(choice.text ?? choice.answer) || (media ? 'Réponse en image' : 'Réponse sans texte'),
        correct: typeof choice.correct === 'boolean' ? choice.correct : null, ...(media ? { image: media } : {}) };
    });
    const seconds = typeof raw.time === 'number' && Number.isFinite(raw.time) ? raw.time / 1000 : 20;
    questions.push({ id: `q-${index + 1}`, index: questions.length + 1, type: 'quiz',
      question: text(raw.question ?? raw.title) || (raw.image ? 'Question en image' : 'Question sans titre'),
      multiSelect: raw.multiSelect === true || choices.filter(choice => choice.correct === true).length > 1,
      timeLimit: Math.max(5, Math.min(600, Math.round(seconds))), choices, image: image(raw.image) });
  }
  if (!questions.length) throw new PublicQuizError('Aucun QCM exploitable dans ce quiz.', 400);
  return { id: id.toLowerCase(), title: text(data.title) || 'Quiz sans titre', questions, slideCount, skippedCount,
    sourceUrl: `https://create.kahoot.it/details/${id.toLowerCase()}` };
}

export function fetchPublicQuiz(id) {
  if (typeof id !== 'string' || !UUID.test(id)) return Promise.reject(new PublicQuizError('Identifiant public invalide.', 400));
  id = id.toLowerCase();
  return memo(`quiz:${id}`, async () => normalizePublicQuiz(await readJSON(API + id), id));
}

// Explicit links are fetched anonymously: an accessible unlisted quiz needs no account.
export function fetchSharedQuiz(id) {
  if (!UUID.test(id || '')) return Promise.reject(new PublicQuizError('Identifiant de quiz invalide.', 400));
  id = id.toLowerCase();
  return memo(`shared:${id}`, async () => normalizePublicQuiz(await readJSON(API + id), id, { allowShared: true }));
}

export function choiceTexts(values) {
  const texts = values.map(normalizeText);
  const boolean = { true: '@true', vrai: '@true', false: '@false', faux: '@false' };
  const pair = texts.map(text => Object.hasOwn(boolean, text) ? boolean[text] : null);
  return texts.length === 2 && pair.every(Boolean) && new Set(pair).size === 2 ? pair.sort() : texts.sort();
}

export function matchingQuestion(quiz, observed, count) {
  if (count && quiz.questions.length + quiz.slideCount + quiz.skippedCount !== count) return null;
  const exact = quiz.questions.filter(q => normalizeText(q.question) === normalizeText(observed.question));
  if (exact.length !== 1 || exact[0].choices.length !== observed.choices.length) return null;
  const expected = choiceTexts(exact[0].choices.map(choice => choice.text));
  const actual = choiceTexts(observed.choices);
  return expected.every((value, index) => value && value === actual[index]) ? exact[0] : null;
}

// Keep short public search terms consistent with the local search engine.
const STOP_WORDS = new Set('a au aux avec ce ces cette cet dans de des du elle elles en est et eux il ils je la le les leur leurs lui ma mais me mes moi mon ne nos notre nous on ou par pas pour qu que quel quelle quelles quels qui sa sans se ses soi son sont sous sur ta te tes toi ton tout tous toute toutes tu un une vos votre vous y afin alors ainsi apres avant bien car cela celle celles celui ceux chaque chez comme comment contre depuis donc entre etre fait faire font faut fois laquelle lequel lesquelles lesquels lorsque meme moins ni ont parce pendant peu plus pourquoi quand quoi rien selon ses sein si soit telles tels tres trop vers voici voila explique expliquer expliquee expliquees expliques the a an and are as at be because been before being between by can could did do does during each for from had has have how if in into is it its may more most not of on or other our out over same should so some than that their them then there these they this those through to under up use was we were what when where which who why will with within would you your following statement statements correct incorrect true false choose chosen identify determine explain explained explanation answer answers question questions bonne bon bonnes bons affirmation affirmations suivante suivantes suivant suivants correcte correctes incorrecte incorrectes'.split(' '));

export function publicSearchTerms(question) {
  const words = plainQuizText(question).toLowerCase().match(/\p{L}+|\d+/gu) || [];
  const useful = words.filter(word => word.length >= 3 && !STOP_WORDS.has(normalizeText(word)));
  return [...new Set(useful.length ? useful : words)].slice(-2).join(' ');
}

export function searchPublicQuiz(observed, count = null, history = [], title = '') {
  if (typeof observed?.question !== 'string' || !observed.question.trim() || observed.question.length > 1200 ||
      !Array.isArray(observed.choices) || observed.choices.length < 2 || observed.choices.length > 20 ||
      observed.choices.some(choice => typeof choice !== 'string' || !choice.trim() || choice.length > 2000) ||
      (count != null && (!Number.isInteger(count) || count < 1 || count > 500))) {
    return Promise.reject(new PublicQuizError('Question et propositions insuffisantes pour la recherche.', 400));
  }
  const observations = addObservation(Array.isArray(history) ? history.slice(-5).filter(item => addObservation([], item).length) : [], observed);
  if (!observations.length) return Promise.reject(new PublicQuizError('Propositions illisibles ou ambiguës.', 400));
  const queries = [...new Set([publicSearchTerms(observed.question), ...observations.slice(0, -1).reverse().map(item => publicSearchTerms(item.question)),
    typeof title === 'string' ? publicSearchTerms(title.slice(0, 300)) : ''].filter(Boolean))].slice(0, 3);
  const key = JSON.stringify([observations.map(observationKey), count, queries]);
  return memo(`search:${key}`, async () => {
    if (!queries.length) throw new PublicQuizError('Aucun texte exploitable pour la recherche.', 400);
    const candidates = new Set();
    for (const query of queries) {
      const data = await memo(`query:${query}`, () => readJSON(API + '?' + new URLSearchParams({ query, limit: '10' })));
      if (!Array.isArray(data?.entities)) throw new PublicQuizError('Résultats publics illisibles.');
      for (const item of data.entities.slice(0, 10)) {
        const id = item?.card?.uuid;
        if (typeof id === 'string' && UUID.test(id)) candidates.add(id.toLowerCase());
      }
    }
    const ids = [...candidates].slice(0, 20);
    const matches = [];
    for (let start = 0; start < ids.length; start += 5) {
      const batch = await Promise.all(ids.slice(start, start + 5).map(async id => {
        try { return await fetchPublicQuiz(id); }
        catch (error) { if ([400, 404, 413].includes(error.status)) return null; throw error; }
      }));
      for (const quiz of batch) if (quiz && observations.every(item => matchingQuestion(quiz, item, count))) matches.push(quiz);
    }
    if (matches.length > 1) throw new PublicQuizError('Plusieurs quiz publics correspondent ; corrigé non confirmé.', 409);
    if (!matches.length) throw new PublicQuizError('Aucun corrigé confirmé parmi les candidats publics vérifiés.', 404);
    const question = matchingQuestion(matches[0], observed, count);
    if (!question.choices.every(c => typeof c.correct === 'boolean') || !question.choices.some(c => c.correct)) {
      throw new PublicQuizError('Le candidat public ne fournit pas de correction complète.', 404);
    }
    return matches[0];
  });
}
