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
