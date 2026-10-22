import assert from 'node:assert/strict';
import test, { after } from 'node:test';

const quizId = '77c46705-dab1-4ca1-a435-c287194db522';
const token = 'test_token_12345678901234567890';
const sender = { tab: { id: 42, url: 'https://kahoot.it/answer/result' } };
const quiz = { id: quizId, title: 'Quiz de test', questions: [{ question: 'Question ?', choices: [] }] };
let metadata, stored, status, body, requests, injections, storageReads, listener, injectError, networkError;
const originalNow = Date.now;
let clock = 1_000_000;
Date.now = () => clock;
after(() => { Date.now = originalNow; });
function reset() {
  clock += 60_001;
  metadata = { quizId, title: 'Quiz de test', questionCount: 16 };
  stored = { baseUrl: 'http://127.0.0.1:8765', token };
  status = 200; body = quiz; requests = []; injections = []; storageReads = 0;
  injectError = false; networkError = false;
}
reset();
globalThis.chrome = {
  scripting: { executeScript: async payload => {
    injections.push(payload);
    if (injectError) throw new Error('Détail de page non destiné à la réponse');
    return [{ result: metadata }];
  } },
  storage: { local: { get: async key => { assert.equal(key, 'ezkConnection'); storageReads++; return { ezkConnection: stored }; } } },
  runtime: { onMessage: { addListener: callback => { listener = callback; } } }
};
globalThis.fetch = async (url, options) => {
  requests.push({ url, options });
  if (networkError) throw new Error('Connexion refusée');
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};
const { discoverForTab } = await import('../background.js');

test('worker rejects missing or non-Kahoot tab senders without injection', async () => {
  reset();
  for (const invalid of [{}, { tab: { id: 42, url: 'https://example.com' } }, { tab: { id: 42, url: 'http://kahoot.it' } },
    { tab: { id: 42, url: 'https://kahoot.it.example.com' } }, { tab: { id: '42', url: 'https://kahoot.it' } }]) {
    assert.equal((await discoverForTab({}, invalid)).ok, false);
  }
  assert.equal(injections.length, 0);
  assert.equal(requests.length, 0);
});

test('worker probes MAIN and returns only bounded metadata without an ID', async () => {
  reset(); metadata = { quizId: 'invalid', title: 'a'.repeat(400), questionCount: 501, token: 'never return', cookies: 'never return' };
  const result = await discoverForTab({}, sender);
  assert.deepEqual(injections, [{ target: { tabId: 42 }, world: 'MAIN', files: ['probe-runtime.js'] }]);
  assert.deepEqual(result, { ok: true, metadata: { quizId: null, title: 'a'.repeat(300), questionCount: null }, quiz: null });
  assert.equal(storageReads, 0);
  assert.equal(requests.length, 0);
});

test('worker avoids another fetch when the caller already has this quiz', async () => {
  reset();
  const result = await discoverForTab({ knownQuizId: quizId.toUpperCase() }, sender);
  assert.equal(result.quiz, null);
  assert.equal(result.metadata.quizId, quizId);
  assert.equal(storageReads, 0);
  assert.equal(requests.length, 0);
});

test('worker fetches the public quiz through the authenticated local bridge', async () => {
  reset(); metadata.quizId = quizId.toUpperCase();
  const result = await discoverForTab({}, sender);
  assert.deepEqual(result, { ok: true, metadata: { quizId, title: 'Quiz de test', questionCount: 16 }, quiz });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `http://127.0.0.1:8765/bridge/quiz?input=${quizId}`);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.ok(!JSON.stringify(result).includes(token));
});

test('worker reports expired connection and missing quiz without upstream error text', async () => {
  for (const code of [401, 403, 404, 500]) {
    reset(); status = code; body = { error: token };
    const result = await discoverForTab({}, sender);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('worker rejects a non-local connection, unavailable page, network failure, and invalid quiz', async () => {
  reset(); stored.baseUrl = 'https://evil.test';
  assert.equal((await discoverForTab({}, sender)).ok, false);
  assert.equal(requests.length, 0);
  reset(); injectError = true;
  const inaccessible = await discoverForTab({}, sender);
  assert.equal(inaccessible.ok, false);
  assert.ok(!inaccessible.error.includes('Détail'));
  reset(); networkError = true;
  assert.equal((await discoverForTab({}, sender)).ok, false);
  reset(); body = { questions: [] };
  assert.equal((await discoverForTab({}, sender)).ok, false);
});

test('worker listener ignores unrelated messages and keeps the response channel open', async () => {
  reset(); metadata = null;
  assert.equal(listener({ type: 'OTHER' }, sender, () => {}), false);
  let resolve;
  const response = new Promise(done => { resolve = done; });
  assert.equal(listener({ type: 'EZK_DISCOVER' }, sender, resolve), true);
  assert.deepEqual(await response, { ok: true, metadata: { quizId: null, title: '', questionCount: null }, quiz: null });
});

test('worker preserves a valid revealed answer only on result routes and strips extra fields', async () => {
  reset(); metadata.quizId = null;
  metadata.revealedAnswer = { phase: 'result', roundId: '1234567890123', question: 'Q'.repeat(1300),
    answers: [{ text: ' Bonne réponse ', correct: true, token }], token };
  const result = await discoverForTab({}, sender);
  assert.deepEqual(result.metadata.revealedAnswer, { phase: 'result', roundId: '1234567890', question: 'Q'.repeat(1200), answers: [{ text: 'Bonne réponse' }] });
  assert.ok(!JSON.stringify(result).includes(token));
  const plural = await discoverForTab({}, { tab: { id: 42, url: 'https://kahoot.it/answer/results' } });
  assert.equal(plural.metadata.revealedAnswer.phase, 'result');
  for (const path of ['/answer', '/answer/question', '/answer/result-extra', '/lobby']) {
    const active = await discoverForTab({}, { tab: { id: 42, url: `https://kahoot.it${path}` } });
    assert.ok(!Object.hasOwn(active.metadata, 'revealedAnswer'));
  }
});

test('worker rejects premature, malformed, overlong, or excessive revealed answers', async () => {
  reset(); metadata.quizId = null;
  const valid = { phase: 'result', roundId: '1', question: '', answers: [{ text: 'Oui' }] };
  for (const changes of [
    { phase: 'question' }, { roundId: 1 }, { roundId: ' ' }, { question: null }, { answers: [] },
    { answers: [{ text: 4 }] }, { answers: [{ text: ' ' }] }, { answers: [{ text: 'x'.repeat(2001) }] },
    { answers: Array.from({ length: 21 }, () => ({ text: 'Oui' })) }
  ]) {
    metadata.revealedAnswer = { ...valid, ...changes };
    const result = await discoverForTab({}, sender);
    assert.ok(!Object.hasOwn(result.metadata, 'revealedAnswer'));
  }
});

test('worker retains revealed answer metadata if fetching the public quiz fails', async () => {
  reset(); status = 404;
  metadata.revealedAnswer = { phase: 'result', roundId: '1', question: 'Question ?', answers: [{ text: 'Oui' }] };
  const result = await discoverForTab({}, sender);
  assert.equal(result.ok, false);
  assert.deepEqual(result.metadata.revealedAnswer, metadata.revealedAnswer);
});

test('worker caches successful public quizzes for 60 seconds while probing fresh metadata', async () => {
  reset();
  const first = await discoverForTab({}, sender);
  clock += 59_999;
  metadata.title = 'Titre actualisé';
  const second = await discoverForTab({}, sender);
  assert.deepEqual(second.quiz, first.quiz);
  assert.equal(second.metadata.title, 'Titre actualisé');
  assert.equal(injections.length, 2);
  assert.equal(requests.length, 1);
  clock += 1;
  assert.equal((await discoverForTab({}, sender)).ok, true);
  assert.equal(requests.length, 2);
});

test('worker isolates cached quizzes by tab, quiz ID, connection address, and token', async () => {
  reset();
  await discoverForTab({}, sender);
  await discoverForTab({}, { tab: { ...sender.tab, id: 43 } });
  assert.equal(requests.length, 2);
  metadata.quizId = '6f5c6217-f9c5-47a6-940c-b0455260095a';
  await discoverForTab({}, sender);
  assert.equal(requests.length, 3);
  stored.token = 'second_token_12345678901234567890';
  await discoverForTab({}, sender);
  assert.equal(requests.length, 4);
  stored.baseUrl = 'http://127.0.0.1:8766';
  await discoverForTab({}, sender);
  assert.equal(requests.length, 5);
});

test('worker cache is bounded at 64 entries and evicts the least recently used quiz', async () => {
  reset();
  const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  for (let index = 1; index <= 64; index++) {
    metadata.quizId = id(index);
    await discoverForTab({}, sender);
  }
  assert.equal(requests.length, 64);
  metadata.quizId = id(1);
  await discoverForTab({}, sender);
  assert.equal(requests.length, 64);
  metadata.quizId = id(65);
  await discoverForTab({}, sender);
  assert.equal(requests.length, 65);
  metadata.quizId = id(2);
  await discoverForTab({}, sender);
  assert.equal(requests.length, 66);
});

test('worker does not cache failed fetches or invalid quiz documents', async () => {
  reset(); status = 404;
  await discoverForTab({}, sender);
  status = 200;
  assert.equal((await discoverForTab({}, sender)).ok, true);
  assert.equal(requests.length, 2);
  reset(); body = { questions: [] };
  await discoverForTab({}, sender);
  body = quiz;
  assert.equal((await discoverForTab({}, sender)).ok, true);
  assert.equal(requests.length, 2);
});

const observed = {
  question: 'Quelle caractéristique décrit une population ?',
  choices: ['Sa taille', 'Sa couleur', 'Sa vitesse', 'Sa masse'], roundId: '4'
};
const recoveredId = '10000000-0000-4000-8000-000000000004';
const recovered = {
  id: recoveredId, title: 'Quiz public retrouvé', questions: [
    { question: observed.question, choices: observed.choices.map((text, index) => ({ text, correct: index === 0 })) },
    { question: 'Une autre question ?', choices: [{ text: 'Oui', correct: true }, { text: 'Non', correct: false }] }
  ], slideCount: 0, skippedCount: 0
};
function prepareSearch() {
  reset();
  metadata = { quizId: null, title: '', questionCount: 2, observedQuestion: structuredClone(observed) };
  body = { quiz: structuredClone(recovered), source: 'public-search' };
}

test('worker accepts player observations only on exact player routes and strips extra data', async () => {
  prepareSearch();
  metadata.observedQuestion.token = token;
  metadata.observedQuestion.roundId = '1234567890123';
  metadata.observedQuestion.question = `  ${observed.question}  `;
  metadata.observedQuestion.choices = observed.choices.map(choice => ` ${choice} `);
  for (const path of ['/gameblock', '/v2/gameblock', '/answer/result', '/answer/results/']) {
    const result = await discoverForTab({}, { tab: { ...sender.tab, url: `https://kahoot.it${path}` } });
    assert.deepEqual(result.metadata.observedQuestion, { ...observed, roundId: '1234567890' });
    assert.ok(!JSON.stringify(result).includes(token));
  }
  for (const path of ['/gameblock/other', '/answer', '/answer/question', '/lobby', '/v2/gameblock-extra']) {
    const result = await discoverForTab({}, { tab: { ...sender.tab, url: `https://kahoot.it${path}` } });
    assert.ok(!Object.hasOwn(result.metadata, 'observedQuestion'));
    assert.equal(result.quiz, null);
  }
  assert.equal(requests.length, 1);
});

test('worker ignores absent or malformed observations without reading the connection or searching', async () => {
  for (const changes of [
    { question: '' }, { question: ' ' }, { question: null }, { question: 'x'.repeat(1201) },
    { roundId: 4 }, { roundId: ' ' }, { choices: [] }, { choices: ['Only'] },
    { choices: ['Oui', null] }, { choices: ['Oui', ' '] }, { choices: ['Oui', 'x'.repeat(2001)] },
    { choices: Array.from({ length: 21 }, () => 'Oui') }
  ]) {
    prepareSearch(); metadata.observedQuestion = { ...observed, ...changes };
    const result = await discoverForTab({}, sender);
    assert.equal(result.ok, true);
    assert.equal(result.quiz, null);
    assert.ok(!Object.hasOwn(result.metadata, 'observedQuestion'));
    assert.equal(storageReads, 0);
    assert.equal(requests.length, 0);
  }
  prepareSearch(); delete metadata.observedQuestion;
  assert.equal((await discoverForTab({}, sender)).quiz, null);
  assert.equal(requests.length, 0);
});

test('worker searches through the authenticated bridge with bounded player text and explicit provenance', async () => {
  prepareSearch(); metadata.observedQuestion.choices.reverse();
  const result = await discoverForTab({ knownQuizId: quizId }, sender);
  assert.equal(result.ok, true);
  assert.deepEqual(result.quiz, recovered);
  assert.equal(result.source, 'public-search');
  assert.equal(result.searchStatus, 'matched');
  assert.equal(result.metadata.quizId, null);
  assert.equal(requests[0].url, 'http://127.0.0.1:8765/bridge/search-quiz');
  const options = requests[0].options;
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.deepEqual(JSON.parse(options.body), { question: observed.question, choices: [...observed.choices].reverse(), questionCount: 2 });
  assert.ok(!JSON.stringify(result).includes(token));
  prepareSearch(); metadata.questionCount = null;
  await discoverForTab({}, sender);
  assert.ok(!Object.hasOwn(JSON.parse(requests[0].options.body), 'questionCount'));
});

test('worker keeps UUID discovery first and skips search only for an exact known-quiz hint', async () => {
  prepareSearch(); metadata.quizId = quizId; body = quiz;
  assert.deepEqual((await discoverForTab({}, sender)).quiz, quiz);
  assert.ok(requests[0].url.includes('/bridge/quiz?input='));
  prepareSearch();
  const result = await discoverForTab({ knownQuizId: recoveredId, knownQuizMatchesObserved: true }, sender);
  assert.equal(result.quiz, null);
  assert.equal(storageReads, 0);
  assert.equal(requests.length, 0);
  await discoverForTab({ knownQuizId: recoveredId }, sender);
  assert.equal(requests.length, 1);
});

test('worker caches exact search success for 60 seconds and shares an in-flight search', async () => {
  prepareSearch();
  const results = await Promise.all([discoverForTab({}, sender), discoverForTab({}, sender)]);
  assert.deepEqual(results[0].quiz, recovered);
  assert.deepEqual(results[1].quiz, recovered);
  assert.equal(requests.length, 1);
  clock += 59_999;
  metadata.observedQuestion.roundId = '5';
  assert.equal((await discoverForTab({}, sender)).metadata.observedQuestion.roundId, '5');
  assert.equal(requests.length, 1);
  clock += 1;
  await discoverForTab({}, sender);
  assert.equal(requests.length, 2);
});

test('worker reuses a recovered quiz for later exact observations but searches on a contradiction', async () => {
  prepareSearch(); await discoverForTab({}, sender);
  metadata.observedQuestion = { question: recovered.questions[1].question, choices: ['Non', 'Oui'], roundId: '5' };
  const next = await discoverForTab({ knownQuizId: recoveredId }, sender);
  assert.equal(next.ok, true);
  assert.equal(next.quiz, null);
  assert.equal(next.source, 'public-search');
  assert.equal(requests.length, 1);
  metadata.observedQuestion.choices = ['Peut-être', 'Oui']; status = 404;
  const conflict = await discoverForTab({ knownQuizId: recoveredId }, sender);
  assert.equal(conflict.quiz, null);
  assert.equal(conflict.searchStatus, 'not-found');
  assert.equal(requests.length, 2);
  metadata.observedQuestion.choices = ['Non', 'Oui']; metadata.questionCount = 3;
  await discoverForTab({ knownQuizId: recoveredId }, sender);
  assert.equal(requests.length, 3);
});

test('worker confirms complete localized boolean choices without accepting longer phrases', async () => {
  prepareSearch();
  body.quiz.questions[1].choices = [{ text: 'True', correct: true }, { text: 'False', correct: false }];
  await discoverForTab({}, sender);
  metadata.observedQuestion = { question: recovered.questions[1].question, choices: ['Faux', 'Vrai'], roundId: '5' };
  const result = await discoverForTab({ knownQuizId: recoveredId }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.quiz, null);
  assert.equal(requests.length, 1);
  metadata.observedQuestion.choices = ['Faux', 'Vrai parfois']; status = 404;
  assert.equal((await discoverForTab({ knownQuizId: recoveredId }, sender)).searchStatus, 'not-found');
  assert.equal(requests.length, 2);
});

test('worker retries missing and ambiguous public matches only after ten seconds', async () => {
  for (const [code, expected] of [[404, 'not-found'], [409, 'ambiguous']]) {
    prepareSearch(); status = code; body = { error: token };
    const first = await discoverForTab({}, sender);
    assert.equal(first.ok, true);
    assert.equal(first.quiz, null);
    assert.equal(first.searchStatus, expected);
    assert.equal(first.source, 'public-search');
    assert.ok(!JSON.stringify(first).includes(token));
    clock += 9_999;
    await discoverForTab({}, sender);
    assert.equal(requests.length, 1);
    clock += 1; status = 200; body = { quiz: recovered, source: 'public-search' };
    assert.deepEqual((await discoverForTab({}, sender)).quiz, recovered);
    assert.equal(requests.length, 2);
  }
});

test('worker preserves observations on search auth errors and throttles network failures', async () => {
  for (const code of [401, 403, 500]) {
    prepareSearch(); status = code; body = { error: token };
    const result = await discoverForTab({}, sender);
    assert.equal(result.ok, false);
    assert.deepEqual(result.metadata.observedQuestion, observed);
    assert.ok(!JSON.stringify(result).includes(token));
    await discoverForTab({}, sender);
    assert.equal(requests.length, 1);
  }
  prepareSearch(); stored.baseUrl = 'https://evil.test';
  assert.equal((await discoverForTab({}, sender)).ok, false);
  assert.equal(requests.length, 0);
  prepareSearch(); networkError = true;
  assert.equal((await discoverForTab({}, sender)).ok, false);
  networkError = false;
  assert.equal((await discoverForTab({}, sender)).ok, false);
  assert.equal(requests.length, 1);
  clock += 10_000;
  assert.equal((await discoverForTab({}, sender)).ok, true);
  assert.equal(requests.length, 2);
});

test('worker rejects search candidates with contradictory text, choices, count, or corrections', async () => {
  for (const change of [
    candidate => { candidate.questions[0].question += ' Autre'; },
    candidate => { candidate.questions[0].choices[0].text = 'Autre proposition'; },
    candidate => { candidate.questions[0].choices.pop(); },
    candidate => { candidate.questions[0].choices[0].correct = null; },
    candidate => { candidate.questions[0].choices.forEach(choice => { choice.correct = false; }); },
    candidate => { candidate.questions.push(structuredClone(candidate.questions[0])); },
    candidate => { candidate.skippedCount = 1; },
    candidate => { candidate.id = 'not-an-uuid'; }
  ]) {
    prepareSearch(); change(body.quiz);
    const result = await discoverForTab({}, sender);
    assert.equal(result.ok, true);
    assert.equal(result.quiz, null);
    assert.equal(result.searchStatus, 'ambiguous');
    await discoverForTab({}, sender);
    assert.equal(requests.length, 1);
  }
  prepareSearch(); body.source = 'unknown';
  assert.equal((await discoverForTab({}, sender)).quiz, null);
  prepareSearch();
  metadata.observedQuestion.choices = ['Identique', 'Identique']; metadata.questionCount = 1;
  body.quiz.questions = [{ question: observed.question, choices: [{ text: 'Identique', correct: true }, { text: 'Identique', correct: false }] }];
  assert.equal((await discoverForTab({}, sender)).quiz, null);
});

test('worker separates public-search cache by tab, connection, question, choices and count', async () => {
  prepareSearch(); status = 404;
  await discoverForTab({}, sender);
  await discoverForTab({}, { tab: { ...sender.tab, id: 43 } });
  stored.token = 'second_token_12345678901234567890';
  await discoverForTab({}, sender);
  stored.baseUrl = 'http://127.0.0.1:8766';
  await discoverForTab({}, sender);
  metadata.observedQuestion.question += ' Autre';
  await discoverForTab({}, sender);
  metadata.observedQuestion.choices = ['Choix A', 'Choix B'];
  await discoverForTab({}, sender);
  metadata.questionCount = 3;
  await discoverForTab({}, sender);
  assert.equal(requests.length, 7);
});

test('worker public-search cache keeps at most 64 recent signatures', async () => {
  prepareSearch(); status = 404;
  const question = number => `${observed.question} ${number}`;
  for (let index = 1; index <= 64; index++) {
    metadata.observedQuestion.question = question(index);
    await discoverForTab({}, sender);
  }
  assert.equal(requests.length, 64);
  metadata.observedQuestion.question = question(1);
  await discoverForTab({}, sender);
  assert.equal(requests.length, 64);
  metadata.observedQuestion.question = question(65);
  await discoverForTab({}, sender);
  metadata.observedQuestion.question = question(2);
  await discoverForTab({}, sender);
  assert.equal(requests.length, 66);
});
