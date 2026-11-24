import { plainQuizText } from './quiz-text.js';

export function discoverQuizMetadata() {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sources = ['public-url', 'json-script', 'game-session', 'react-store', 'received-network'];
  const records = [];
  const revelations = [];
  const observations = [];
  let receivedNetwork = false;
  let isResultPage = false;
  let isObservedQuestionPage = false;
  try { isResultPage = /^(?:\/answer)?\/results?\/?$/i.test(new URL(location.href).pathname); } catch { /* No result is exposed outside a recognized result route. */ }
  try {
    const page = new URL(location.href);
    isObservedQuestionPage = page.protocol === 'https:' && ['kahoot.it', 'www.kahoot.it', 'create.kahoot.it', 'play.kahoot.it'].includes(page.hostname) &&
      /^(?:(?:\/v2)?\/gameblock|\/answer\/results?)\/?$/i.test(page.pathname);
  } catch { /* Only recognized player question/result routes expose received question text. */ }
  const limits = { nodes: 3000, depth: 8, jsonLength: 2 * 1024 * 1024 };
  const sensitive = /cookie|session|token|participant|user|services|tracking|credential|password|secret|authorization|authentication|^auth$|oauth|bearer|apikey|privatekey|accesskey|csrf|email|phone|fingerprint|device|clientid/i;
  const keyName = value => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const idKey = key => /^(?:quiz|kahoot)(?:id|uuid)$/.test(key);
  const titleKey = key => /^(?:quiztitle|kahoottitle|quizname|kahootname)$/.test(key);
  const data = (object, key) => {
    try { return object && Object.getOwnPropertyDescriptor(object, key)?.value; } catch { return undefined; }
  };
  const addId = (value, source) => {
    if (typeof value === 'string' && uuid.test(value.trim())) records.push({ quizId: value.trim().toLowerCase(), source });
  };
  const addTitle = (value, source) => {
    if (typeof value !== 'string') return;
    const title = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title) records.push({ title, source });
  };
  const addCount = (value, source) => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,5}$/.test(value) ? Number(value) : NaN;
    if (Number.isInteger(number) && number > 0 && number <= 10000) records.push({ questionCount: number, source });
  };
  const readRevealedAnswer = object => {
    if (!isResultPage) return;
    const block = data(object, 'gameBlockState');
    const question = data(block, 'question');
    const result = data(block, 'result');
    const numberOfChoices = data(question, 'numberOfChoices');
    const correctChoices = data(result, 'correctChoices');
    const questionNumber = data(object, 'questionNumber');
    if (!Number.isInteger(numberOfChoices) || numberOfChoices < 2 || numberOfChoices > 20 ||
        !Number.isInteger(questionNumber) || questionNumber < 0 || questionNumber > 9999 ||
        !Array.isArray(correctChoices) || correctChoices.length < 1 || correctChoices.length > 20 ||
        !correctChoices.every(index => Number.isInteger(index) && index >= 0 && index < numberOfChoices)) return;
    const choices = data(question, 'choices');
    revelations.push({
      phase: 'result', roundId: String(questionNumber + 1),
      question: plainQuizText(data(object, 'gameBlockTitle')) || plainQuizText(data(block, 'gameBlockTitle')),
      answers: [...new Set(correctChoices)].map(index => {
        const choice = Array.isArray(choices) ? data(choices, String(index)) : undefined;
        return { text: plainQuizText(choice) || plainQuizText(data(choice, 'text')) || plainQuizText(data(choice, 'answer')) || `Proposition ${index + 1}` };
      })
    });
  };
  const readObservedQuestion = object => {
    if (!isObservedQuestionPage) return;
    const block = data(object, 'gameBlockState');
    const question = data(block, 'question');
    const rawChoices = data(question, 'choices');
    const choiceCount = data(rawChoices, 'length');
    const numberOfChoices = data(question, 'numberOfChoices');
    const questionNumber = data(object, 'questionNumber');
    if (!Number.isInteger(questionNumber) || questionNumber < 0 || questionNumber > 9999 ||
        !Array.isArray(rawChoices) || !Number.isInteger(choiceCount) || choiceCount < 2 || choiceCount > 20 ||
        (numberOfChoices !== undefined && (!Number.isInteger(numberOfChoices) || numberOfChoices !== choiceCount))) return;
    const title = plainQuizText(data(object, 'gameBlockTitle')) || plainQuizText(data(block, 'gameBlockTitle'));
    const placeholder = /^(?:question (?:en image|sans titre)|r[eé]ponse (?:en image|sans texte)|proposition \d+|triangle|circle|square|diamond|red|blue|yellow|green)$/i;
    if (!title || placeholder.test(title) || /^question\s+\d+(?:\s+(?:sur|of)\s+\d+)?[.!?]?$/i.test(title)) return;
    const choices = Array.from({ length: choiceCount }, (_, index) => {
      const choice = data(rawChoices, String(index));
      return plainQuizText(choice) || plainQuizText(data(choice, 'text')) || plainQuizText(data(choice, 'answer'));
    });
    if (choices.some(choice => !choice || placeholder.test(choice))) return;
    observations.push({ question: title, choices, roundId: String(questionNumber + 1) });
  };
  const session = (object, source) => {
    if (!object || typeof object !== 'object') return;
    if (source === 'react-store') {
      readRevealedAnswer(object);
      readObservedQuestion(object);
    }
    let keys;
    try { keys = Object.keys(object).slice(0, 200); } catch { return; }
    for (const key of keys) {
      const name = keyName(key);
      if (idKey(name)) addId(data(object, key), source);
      else if (titleKey(name)) addTitle(data(object, key), source);
      else if (name === 'numgameblocks') addCount(data(object, key), source);
    }
  };
  let scannedNodes = 0;
  const scan = (initial, source) => {
    const seen = new Set();
    const queue = [{ value: initial, depth: 0, quizObject: false }];
    for (let cursor = 0; cursor < queue.length && scannedNodes < limits.nodes; cursor++) {
      const { value, depth, quizObject } = queue[cursor];
      if (!value || typeof value !== 'object' || seen.has(value) || depth > limits.depth) continue;
      seen.add(value);
      scannedNodes++;
      let keys;
      try { keys = Object.keys(value).slice(0, limits.nodes); } catch { continue; }
      for (const key of keys) {
        const name = keyName(key);
        if (idKey(name)) { addId(data(value, key), source); continue; }
        if (titleKey(name) || (quizObject && name === 'title')) { addTitle(data(value, key), source); continue; }
        if ((quizObject && ['questioncount', 'numberofquestions', 'numquestions', 'numgameblocks'].includes(name)) || ['quizquestioncount', 'kahootquestioncount'].includes(name)) {
          addCount(data(value, key), source);
          continue;
        }
        if (name === 'gamesession') { session(data(value, key), source); continue; }
        if (sensitive.test(name) || depth >= limits.depth || queue.length >= limits.nodes) continue;
        const child = data(value, key);
        if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1, quizObject: name === 'quiz' || name === 'kahoot' });
      }
    }
  };
  const fromUrl = value => {
    if (typeof value !== 'string') return;
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || url.username || url.password || !['kahoot.it', 'www.kahoot.it', 'create.kahoot.it', 'play.kahoot.it'].includes(url.hostname)) return;
      const path = decodeURIComponent(url.pathname);
      const match = path.match(/\/(?:details|rest\/kahoots)\/([0-9a-f-]{36})(?:\/|$)/i) ||
        path.match(/\/share\/(?:[^/]+\/)?([0-9a-f-]{36})(?:\/|$)/i);
      if (match) addId(match[1], 'public-url');
    } catch { /* Non-public and malformed links do not identify a quiz. */ }
  };
  try {
    fromUrl(location.href);
    fromUrl(document.querySelector('link[rel="canonical"]')?.href);
    fromUrl(document.querySelector('meta[property="og:url"]')?.content);
    for (const anchor of [...document.querySelectorAll('a[href]')].slice(0, 200)) fromUrl(anchor.href);
  } catch { /* Metadata discovery remains available without public links. */ }
  try {
    const scripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__');
    for (const script of [...scripts].slice(0, 20)) {
      const content = script.textContent;
      if (typeof content !== 'string' || !content.trim() || content.length > limits.jsonLength) continue;
      try { scan(JSON.parse(content), 'json-script'); } catch { /* Only JSON is parsed, never executable script. */ }
    }
  } catch { /* Some pages expose no structured JSON. */ }
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem('kahoot-game_session');
    if (typeof raw === 'string' && raw.length <= limits.jsonLength) session(JSON.parse(raw), 'game-session');
  } catch { /* Storage may be disabled or contain an incomplete session. */ }

  try {
    const root = document.getElementById('root');
    const queue = [];
    if (root) {
      for (const key of Object.getOwnPropertyNames(root)) {
        if (/^__react(?:Container|Fiber)\$/.test(key)) {
          const fiber = data(root, key);
          if (fiber && typeof fiber === 'object') queue.push(fiber);
        }
      }
    }
    const seen = new Set();
    const stores = new Set();
    for (let cursor = 0; cursor < queue.length && seen.size < limits.nodes; cursor++) {
      const fiber = queue[cursor];
      if (!fiber || typeof fiber !== 'object' || seen.has(fiber)) continue;
      seen.add(fiber);
      const props = data(fiber, 'memoizedProps');
      const state = data(fiber, 'memoizedState');
      const candidates = [data(props, 'store'), data(data(props, 'value'), 'store'), data(data(data(state, 'element'), 'props'), 'store')];
      for (const store of candidates) {
        if (!store || typeof store !== 'object' || stores.has(store)) continue;
        stores.add(store);
        const getState = data(store, 'getState');
        if (typeof getState !== 'function') continue;
        try { scan(data(getState.call(store), 'features'), 'react-store'); } catch { /* A stale React branch need not prevent reading another store. */ }
      }
      for (const key of ['child', 'sibling', 'alternate', 'current']) {
        if (queue.length >= limits.nodes * 3) break;
        const next = data(fiber, key);
        if (next && typeof next === 'object' && !seen.has(next)) queue.push(next);
      }
    }
  } catch { /* React internals are optional and may change across releases. */ }

  // Passive receive hook is optional. Only recent sanitized quiz fields are read.
  try {
    if (!isObservedQuestionPage && globalThis.__ezKahootNetworkV1) globalThis.__ezKahootNetworkV1.snapshot = null;
    const network = globalThis.__ezKahootNetworkV1?.snapshot;
    if (network && Number.isFinite(network.updatedAt) && Date.now() - network.updatedAt >= 0 && Date.now() - network.updatedAt < 30_000) {
      if (isObservedQuestionPage) {
        if (network.quizId) addId(network.quizId, 'received-network');
        if (network.questionCount) addCount(network.questionCount, 'received-network');
        if (network.observedQuestion && !observations.length) { observations.push(network.observedQuestion); receivedNetwork = true; }
        if (isResultPage && network.revealedAnswer && !revelations.length) revelations.push(network.revealedAnswer);
      }
    }
  } catch { /* Page-controlled fields are validated again by the isolated worker. */ }

  const sorted = records.sort((left, right) => sources.indexOf(left.source) - sources.indexOf(right.source));
  const ids = [...new Set(sorted.map(record => record.quizId).filter(Boolean))];
  const idRecord = sorted.find(record => record.quizId);
  const titleRecord = sorted.find(record => record.title);
  const countRecord = sorted.find(record => record.questionCount);
  const questionCount = countRecord?.questionCount ?? null;
  const distinctRevelations = [...new Map(revelations.map(value => [JSON.stringify(value), value])).values()];
  const revealed = distinctRevelations.length === 1 ? { revealedAnswer: distinctRevelations[0] } : {};
  const distinctObservations = [...new Map(observations.map(value => [JSON.stringify(value), value])).values()];
  const observed = distinctObservations.length === 1 ? { observedQuestion: distinctObservations[0] } : {};
  if (ids.length > 1) return { quizId: null, title: '', questionCount, source: 'ambiguous', diagnostic: 'Plusieurs identifiants de quiz sont présents dans la page.', ...revealed, ...observed };
  if (ids.length === 1) return { quizId: ids[0], title: titleRecord?.title || '', questionCount, source: idRecord.source, diagnostic: 'Identifiant du quiz retrouvé dans les métadonnées de la page.', ...revealed, ...observed };
  if (titleRecord) return { quizId: null, title: titleRecord.title, questionCount, source: titleRecord.source, diagnostic: 'Un titre de quiz est présent, sans identifiant public.', ...revealed, ...observed };
  return {
    quizId: null, title: '', questionCount, source: countRecord?.source || (observations.length ? (receivedNetwork ? 'received-network' : 'react-store') : 'none'),
    diagnostic: questionCount ? `La session indique ${questionCount} questions, mais n’a pas transmis l’identifiant du quiz.` : 'Cette page n’a pas transmis de métadonnées de quiz.', ...revealed, ...observed
  };
}
