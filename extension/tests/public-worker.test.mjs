import assert from 'node:assert/strict';
import test, { beforeEach, after } from 'node:test';

const id = '77c46705-dab1-4ca1-a435-c287194db522';
const observed = { question: 'Quelle est la capitale de la France ?', choices: ['Paris', 'Lyon'], roundId: '2' };
const raw = { uuid: id, visibility: 1, title: 'Géographie', questions: [{ question: observed.question, choices: [{ answer: 'Paris', correct: true }, { answer: 'Lyon', correct: false }] }] };
let metadata, capture, injections, requests, status;
const originalFetch = globalThis.fetch, originalNow = Date.now;
let clock = 10_000;
Date.now = () => clock;
globalThis.chrome = {
  runtime: { onMessage: { addListener() {} } },
  scripting: { executeScript: async payload => { injections.push(payload); return [{ result: payload.files[0] === 'reader.js' ? capture : metadata }]; } },
  storage: { local: { get: async key => { assert.notEqual(key, 'ezkConnection'); return {}; } } }
};
globalThis.fetch = async (url, options) => {
  requests.push({ url, options });
  return Response.json(url.includes('?') ? { entities: [{ card: { uuid: id } }] } : raw, { status });
};
const { discoverForTab } = await import('../background.js');
const sender = { tab: { id: 42, url: 'https://kahoot.it/gameblock' }, frameId: 0 };
beforeEach(() => {
  clock += 60_001;
  metadata = { quizId: id, questionCount: 1 };
  capture = { question: observed.question, choices: observed.choices.map(text => ({ text })), roundId: '2' };
  injections = []; requests = []; status = 200;
});
after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });

test('public discovery loads a detected UUID without local connection, pairing or credentials', async () => {
  const result = await discoverForTab({ publicOnly: true }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.quiz.id, id);
  assert.equal(result.source, 'public-id');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(injections.length, 2);
});

test('visible question and choices are searched when optional page state is absent', async () => {
  metadata = { questionCount: 1 };
  const result = await discoverForTab({ publicOnly: true }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.quiz.id, id);
  assert.equal(result.source, 'public-search');
  assert.deepEqual(result.metadata.observedQuestion, observed);
  assert.deepEqual(injections.map(call => call.files[0]), ['probe-runtime.js', 'reader.js']);
});

test('received question metadata can find the quiz even if the DOM has no text', async () => {
  metadata = { observedQuestion: observed, questionCount: 1 };
  capture = {};
  const result = await discoverForTab({ publicOnly: true }, sender);
  assert.equal(result.quiz.id, id);
  assert.equal(injections.length, 1);
});

test('an already identified compatible quiz avoids another search', async () => {
  metadata = { observedQuestion: observed, questionCount: 1 };
  await discoverForTab({ publicOnly: true }, sender);
  const result = await discoverForTab({ publicOnly: true, knownQuizId: id }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.quiz, null);
  assert.equal(requests.length, 2);
});

test('lobbies and insufficient questions wait without guessing or searching', async () => {
  metadata = {};
  capture = { question: 'Triangle', choices: [] };
  const missing = await discoverForTab({ publicOnly: true }, sender);
  assert.equal(missing.quiz, null);
  const lobby = await discoverForTab({ publicOnly: true }, { tab: { id: 42, url: 'https://kahoot.it/lobby' } });
  assert.equal(lobby.quiz, null);
  assert.equal(requests.length, 0);
});

test('unavailable public quizzes have an explicit status and do not expose invented answers', async () => {
  status = 404;
  const result = await discoverForTab({ publicOnly: true }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.quiz, null);
  assert.equal(result.searchStatus, 'not-found');
  assert.match(result.discoveryMessage, /inaccessible/);
});

test('subframes cannot initiate automatic discovery using the top-level tab URL', async () => {
  const result = await discoverForTab({ publicOnly: true }, { ...sender, frameId: 1 });
  assert.equal(result.ok, false);
  assert.equal(injections.length, 0);
  assert.equal(requests.length, 0);
});
