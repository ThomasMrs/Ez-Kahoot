import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuizLink } from '../quiz-links.js';
import { cleanObservation, addObservation, observationKey } from '../observations.js';
import { parseReceivedQuiz } from '../network-data.js';
import { installQuizReceiver } from '../network-hook.js';
import { discoverQuizMetadata } from '../discovery.js';
import { rememberCorrection, lookupCorrection, listCorrections, clearCorrections, deleteCorrection } from '../correction-memory.js';
import { runToolAction } from '../tool-actions.js';
import { observeSession, getSession, forgetSession } from '../session-context.js';

const id = '77c46705-dab1-4ca1-a435-c287194db522';
const observation = { question: 'Capitale de la France ?', choices: ['Paris', 'Lyon'], roundId: '1' };
const revealed = { phase: 'result', question: observation.question, roundId: '1', answers: [{ text: 'Paris' }] };
let local, session, writes, scripts;
const area = target => ({ get: async key => ({ [key]: structuredClone(target()[key]) }),
  set: async value => { writes++; Object.assign(target(), structuredClone(value)); }, remove: async key => { delete target()[key]; } });
beforeEach(async () => {
  local = {}; session = {}; writes = 0; scripts = 0;
  globalThis.chrome = { runtime: { id: 'unit', getURL: path => 'chrome-extension://unit/' + path },
    storage: { local: area(() => local), session: area(() => session) },
    tabs: { get: async id => ({ id, url: id === 3 ? 'https://kahoot.it/gameblock' : 'https://other.test/' }) },
    scripting: { executeScript: async () => { scripts++; return [{ result: { observedQuestion: observation, source: 'received-network', token: 'SECRET' } }]; } } };
  await forgetSession(3);
});

test('official quiz, share, host and assignment links have distinct meanings', () => {
  for (const value of [id, `https://create.kahoot.it/details/${id}`, `https://create.kahoot.it/share/example/${id}`, `https://play.kahoot.it/?quizId=${id}`, `https://play.kahoot.it/#/?QuizId=${id}`]) assert.deepEqual(parseQuizLink(value), { kind: 'quiz', id });
  assert.equal(parseQuizLink(`https://kahoot.it/challenge/${id}`).kind, 'assignment');
  assert.equal(parseQuizLink('https://kahoot.it/?pin=12345').kind, 'live');
});
test('links reject credentials, foreign domains, malformed IDs and conflicting quiz IDs', () => {
  for (const value of ['12345', 'javascript:alert(1)', `https://create.kahoot.it.evil.test/details/${id}`, `https://user@create.kahoot.it/details/${id}`, `http://create.kahoot.it/details/${id}`, `https://create.kahoot.it/details/${id}?quizId=00000000-0000-4000-8000-000000000001`]) assert.throws(() => parseQuizLink(value));
});
test('observation history is bounded, de-duplicates and replaces transient same-round text', () => {
  let history = [];
  for (let i = 1; i <= 10; i++) history = addObservation(history, { ...observation, question: `Question ${i}`, roundId: String(i) });
  assert.equal(history.length, 6);
  history = addObservation(history, { ...observation, question: 'Texte corrigé', roundId: '10' });
  assert.equal(history.length, 6); assert.equal(history.at(-1).question, 'Texte corrigé');
  assert.equal(cleanObservation({ ...observation, choices: ['Paris', 'paris'] }), null);
  assert.equal(cleanObservation({ ...observation, choices: ['Triangle', 'Circle'] }), null);
});
test('memory only accepts a revealed result tied to the same round and complete choices', async () => {
  for (const patch of [{ phase: 'question' }, { roundId: '2' }, { question: 'Autre question' }, { answers: [{ text: 'Berlin' }] }]) assert.equal(await rememberCorrection(observation, { ...revealed, ...patch }), false);
  assert.equal((await listCorrections()).length, 0);
  assert.equal(await rememberCorrection(observation, revealed), true);
  const quiz = await lookupCorrection({ ...observation, choices: ['Lyon', 'Paris'] });
  assert.equal(quiz.scope, 'question'); assert.ok(quiz.id.length < 200);
  assert.deepEqual(quiz.questions[0].choices.map(c => c.correct), [false, true]);
  assert.equal(await lookupCorrection({ ...observation, choices: ['Paris', 'Berlin'] }), null);
  const before = writes; await rememberCorrection(observation, revealed); assert.equal(writes, before);
});
test('conflicting corrections stay visible in memory but cannot be reused', async () => {
  await rememberCorrection(observation, revealed);
  await rememberCorrection(observation, { ...revealed, answers: [{ text: 'Lyon' }] });
  assert.equal((await listCorrections())[0].conflict, true);
  assert.equal(await lookupCorrection(observation), null);
  await deleteCorrection(observationKey(observation)); assert.deepEqual(await listCorrections(), []);
});
test('memory serializes concurrent updates, supports multiple answers and evicts beyond 100', async () => {
  await Promise.all(Array.from({ length: 110 }, (_, i) => {
    const observed = { ...observation, question: 'Capitales ' + i };
    return rememberCorrection(observed, { ...revealed, question: observed.question, answers: [{ text: 'Paris' }, { text: 'Lyon' }] });
  }));
  const records = await listCorrections(); assert.equal(records.length, 100);
  assert.equal((await lookupCorrection(records[0])).questions[0].multiSelect, true);
  assert.ok(new TextEncoder().encode(JSON.stringify(records)).length <= 1024 * 1024);
  await clearCorrections(); assert.deepEqual(await listCorrections(), []);
});
test('received frames retain quiz fields only; results need a matching explicit round', () => {
  const first = parseReceivedQuiz(JSON.stringify([{ data: { content: JSON.stringify({ question: observation.question, choices: observation.choices, questionIndex: 0, token: 'SECRET', nickname: 'PRIVATE' }) } }]));
  assert.deepEqual(first.observedQuestion, observation);
  assert.ok(!JSON.stringify(first).includes('SECRET')); assert.ok(!JSON.stringify(first).includes('PRIVATE'));
  assert.equal(parseReceivedQuiz(JSON.stringify({ correctChoices: [0] }), first), null);
  assert.equal(parseReceivedQuiz(JSON.stringify({ questionIndex: 1, correctChoices: [0] }), first), null);
  assert.deepEqual(parseReceivedQuiz(JSON.stringify({ questionIndex: 0, correctChoices: [0] }), first).revealedAnswer, revealed);
  assert.equal(parseReceivedQuiz('x'.repeat(512 * 1024 + 1)), null);
  assert.equal(parseReceivedQuiz(JSON.stringify({ token: id, questions: Array(100).fill(observation) })), null);
});
test('passive socket hook preserves constructor and send behavior, filters hosts and forgets old results', () => {
  class FakeSocket { static OPEN = 1; constructor(url) { this.url = url; this.listeners = []; } addEventListener(type, cb) { this.listeners.push(cb); } send(value) { this.sent = value; } receive(value) { for (const cb of this.listeners) cb({ data: JSON.stringify(value) }); } }
  globalThis.WebSocket = FakeSocket; globalThis.location = new URL('https://kahoot.it/gameblock');
  delete globalThis.__ezKahootReceiverInstalled; delete globalThis.__ezKahootNetworkV1;
  installQuizReceiver(); assert.equal(WebSocket.OPEN, 1);
  const socket = new WebSocket('wss://kahoot.it/socket'); assert.ok(socket instanceof FakeSocket);
  socket.send('unchanged'); assert.equal(socket.sent, 'unchanged');
  socket.receive({ question: observation.question, choices: observation.choices, questionIndex: 0 });
  socket.receive({ questionIndex: 0, correctChoices: [0] }); assert.ok(globalThis.__ezKahootNetworkV1.snapshot.revealedAnswer);
  socket.receive({ question: 'Next', choices: ['A', 'B'], questionIndex: 1 }); assert.equal(globalThis.__ezKahootNetworkV1.snapshot.revealedAnswer, undefined);
  const other = new WebSocket('wss://kahoot.it.evil.test/socket'); assert.equal(other.listeners.length, 0);
});

test('metadata-only frames preserve question context without refreshing its display age', () => {
  const originalNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  class Socket {
    addEventListener(type, callback) { this.receive = value => callback({ data: JSON.stringify(value) }); }
  }
  globalThis.WebSocket = Socket;
  globalThis.location = new URL('https://kahoot.it/gameblock');
  delete globalThis.__ezKahootReceiverInstalled;
  delete globalThis.__ezKahootNetworkV1;
  try {
    installQuizReceiver();
    const socket = new WebSocket('wss://kahoot.it/socket');
    socket.receive({ question: observation.question, choices: observation.choices, questionIndex: 0, quizId: id });
    now += 1000;
    socket.receive({ numGameBlocks: 2 });
    const snapshot = globalThis.__ezKahootNetworkV1.snapshot;
    assert.deepEqual(snapshot.observedQuestion, observation);
    assert.equal(snapshot.updatedAt, 100000);
    assert.equal(snapshot.questionCount, 2);
    assert.equal(snapshot.quizId, id);
    socket.receive({ quizId: '00000000-0000-4000-8000-000000000001' });
    assert.equal(globalThis.__ezKahootNetworkV1.snapshot.observedQuestion, undefined);
  } finally { Date.now = originalNow; }
});

test('long-question results retain context while stale question text stays hidden before the result', () => {
  const originalNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  class Socket {
    addEventListener(type, callback) { this.receive = value => callback({ data: JSON.stringify(value) }); }
  }
  globalThis.WebSocket = Socket;
  globalThis.location = new URL('https://kahoot.it/gameblock');
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
  delete globalThis.__ezKahootReceiverInstalled;
  delete globalThis.__ezKahootNetworkV1;
  try {
    installQuizReceiver();
    const socket = new WebSocket('wss://kahoot.it/socket');
    socket.receive({ question: observation.question, choices: observation.choices, questionIndex: 0 });
    now += 605000;
    assert.equal(discoverQuizMetadata().observedQuestion, undefined);
    socket.receive({ questionIndex: 0, correctChoices: [0] });
    assert.deepEqual(globalThis.__ezKahootNetworkV1.snapshot.revealedAnswer, revealed);
    assert.equal(discoverQuizMetadata().revealedAnswer, undefined, 'A result is not exposed on the question route');
    globalThis.location = new URL('https://kahoot.it/answer/result');
    assert.deepEqual(discoverQuizMetadata().revealedAnswer, revealed);
    globalThis.location = new URL('https://kahoot.it/gameblock');
    socket.receive({ question: 'Next', choices: ['A', 'B'], questionIndex: 1 });
    assert.equal(globalThis.__ezKahootNetworkV1.snapshot.revealedAnswer, undefined);
    now += 15 * 60_000 + 1;
    socket.receive({ questionIndex: 1, correctChoices: [0] });
    assert.equal(globalThis.__ezKahootNetworkV1.snapshot, null, 'Expired context cannot attach a later result');
  } finally { Date.now = originalNow; }
});
test('session observations reset on a lobby, new quiz or round regression', async () => {
  await observeSession(3, { observedQuestion: observation, quizId: id }, '/gameblock');
  await observeSession(3, { observedQuestion: { ...observation, question: 'Next', roundId: '2' } }, '/gameblock');
  assert.equal((await getSession(3)).history.length, 2);
  await observeSession(3, { observedQuestion: observation }, '/gameblock'); assert.equal((await getSession(3)).history.length, 1);
  await observeSession(3, {}, '/lobby'); assert.equal((await getSession(3)).history.length, 0);
});
test('tool messages require the exact extension page and an allowed player tab', async () => {
  const sender = { id: 'unit', url: 'chrome-extension://unit/tools.html?tab=3' };
  for (const bad of [{}, { ...sender, url: 'https://kahoot.it/gameblock' }, { ...sender, id: 'other' }, { ...sender, url: 'chrome-extension://unit/popup.html' }]) assert.equal((await runToolAction({ action: 'memory-clear' }, bad)).ok, false);
  assert.equal((await runToolAction({ action: 'diagnostic', tabId: 4 }, sender)).ok, false);
  assert.equal(scripts, 0);
  const response = await runToolAction({ action: 'diagnostic', tabId: 3 }, sender);
  assert.equal(response.ok, true); assert.equal(response.diagnostic.questionReceived, true); assert.ok(!JSON.stringify(response).includes('SECRET'));
});
