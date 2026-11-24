import assert from 'node:assert/strict';
import test, { beforeEach, after } from 'node:test';
import { fetchPublicQuiz, fetchSharedQuiz, searchPublicQuiz, normalizePublicQuiz, matchingQuestion, publicSearchTerms } from '../public-api.js';

const id = '77c46705-dab1-4ca1-a435-c287194db522';
const second = '6f5c6217-f9c5-47a6-940c-b0455260095a';
const observed = { question: 'Quelle est la capitale de la France ?', choices: ['Lyon', 'Paris'] };
const raw = () => ({ uuid: id, title: '<b>Géographie</b>', visibility: 1, questions: [
  { type: 'content', title: 'Introduction' },
  { type: 'quiz', question: observed.question, choices: [{ answer: 'Paris', correct: true }, { answer: 'Lyon', correct: false }] }
] });
let requests, respond;
const originalFetch = globalThis.fetch, originalNow = Date.now;
let clock = 1_000_000;
Date.now = () => clock;
globalThis.fetch = async (url, options) => { requests.push({ url, options }); return respond(url); };
beforeEach(() => {
  clock += 120_001;
  requests = [];
  respond = url => Response.json(url.includes('?') ? { entities: [{ card: { uuid: id } }] } : raw());
});
after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });

test('public normalization preserves known and unknown corrections, slides, mathematics and inert HTML', () => {
  const input = raw();
  input.questions[1].question = '5<sup>2</sup> &gt; 2 <script>bad()</script>';
  input.questions[1].choices[0] = { answer: 'x<y', correct: 'false' };
  const quiz = normalizePublicQuiz(input, id);
  assert.equal(quiz.title, 'Géographie');
  assert.equal(quiz.slideCount, 1);
  assert.equal(quiz.questions[0].question, '5^(2) > 2');
  assert.equal(quiz.questions[0].choices[0].correct, null);
  assert.equal(quiz.questions[0].choices[0].text, 'x<y');
  assert.equal(input.questions[1].choices[0].correct, 'false');
});

test('private, oversized, mismatched and malformed quizzes are refused', () => {
  for (const input of [null, { ...raw(), uuid: second }, { ...raw(), visibility: 0 },
    { ...raw(), questions: Array(501).fill(raw().questions[1]) },
    { ...raw(), questions: [{ ...raw().questions[1], choices: [null, {}] }] }]) {
    assert.throws(() => normalizePublicQuiz(input, id));
  }
});

test('anonymous public fetches are fixed to the quiz endpoint and shared while in flight', async () => {
  const values = await Promise.all([fetchPublicQuiz(id), fetchPublicQuiz(id.toUpperCase())]);
  assert.deepEqual(values[0], values[1]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://create.kahoot.it/rest/kahoots/${id}`);
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  await assert.rejects(fetchPublicQuiz('https://evil.test/quiz'));
  assert.equal(requests.length, 1);
});

test('search compares the complete question, choices and game length then reuses the result', async () => {
  assert.equal(publicSearchTerms(observed.question), 'capitale france');
  const quiz = await searchPublicQuiz(observed, 2);
  assert.equal(quiz.id, id);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).searchParams.get('limit'), '10');
  await searchPublicQuiz({ ...observed, choices: [...observed.choices].reverse() }, 2);
  assert.equal(requests.length, 2);
  assert.equal(matchingQuestion(quiz, { ...observed, choices: ['Paris', 'Nice'] }, 2), null);
  assert.equal(matchingQuestion(quiz, observed, 3), null);
});

test('ambiguous quizzes and unknown corrections never become a confirmed answer', async () => {
  respond = url => Response.json(url.includes('?') ? { entities: [id, second].map(uuid => ({ card: { uuid } })) }
    : { ...raw(), uuid: url.endsWith(second) ? second : id });
  await assert.rejects(searchPublicQuiz(observed, 2), error => error.status === 409);
  clock += 60_001;
  respond = url => {
    const input = raw(); input.questions[1].choices[0].correct = null;
    return Response.json(url.includes('?') ? { entities: [{ card: { uuid: id } }] } : input);
  };
  await assert.rejects(searchPublicQuiz(observed, 2), error => error.status === 404);
});

test('missing candidates are cached briefly and search never fetches more than ten candidates', async () => {
  respond = url => Response.json(url.includes('?') ? { entities: Array.from({ length: 30 }, (_, index) => ({ card: { uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` } })) } : {}, { status: url.includes('?') ? 200 : 404 });
  await assert.rejects(searchPublicQuiz(observed), error => error.status === 404);
  assert.equal(requests.length, 11);
  await assert.rejects(searchPublicQuiz(observed));
  assert.equal(requests.length, 11);
  clock += 10_001;
  await assert.rejects(searchPublicQuiz(observed));
  assert.equal(requests.length, 21, 'Search result list stays cached while failed quiz requests retry');
});

test('rate limiting pauses all new public requests and respects Retry-After', async () => {
  respond = () => new Response('', { status: 429, headers: { 'Retry-After': '90' } });
  await assert.rejects(fetchPublicQuiz(id), error => error.status === 429);
  await assert.rejects(fetchPublicQuiz(second), error => error.status === 429);
  clock += 60_001;
  await assert.rejects(fetchPublicQuiz(second), error => error.status === 429);
  assert.equal(requests.length, 1);
  clock += 30_001;
  respond = () => Response.json(raw());
  assert.equal((await fetchPublicQuiz(id)).id, id);
});

test('declared and streamed oversized bodies and invalid JSON fail without retaining them', async () => {
  respond = () => new Response('{}', { headers: { 'Content-Length': '9000000' } });
  await assert.rejects(fetchPublicQuiz(id), error => error.status === 413);
  clock += 10_001;
  respond = () => new Response('x'.repeat(8 * 1024 * 1024 + 1));
  await assert.rejects(fetchPublicQuiz(id), error => error.status === 413);
  clock += 10_001;
  respond = () => new Response('<html>unavailable</html>');
  await assert.rejects(fetchPublicQuiz(id), error => error.status === 502);
});

test('incomplete searches with an upstream error cannot claim a unique match', async () => {
  respond = url => url.includes('?') ? Response.json({ entities: [id, second].map(uuid => ({ card: { uuid } })) })
    : url.endsWith(second) ? new Response('', { status: 500 }) : Response.json(raw());
  await assert.rejects(searchPublicQuiz(observed, 2), error => error.status === 502);
});

test('malformed observations never trigger a network request', async () => {
  for (const value of [null, {}, { ...observed, question: 'x'.repeat(1201) }, { ...observed, choices: ['A'] }, { ...observed, choices: ['A', null] }]) {
    await assert.rejects(searchPublicQuiz(value), error => error.status === 400);
  }
  assert.equal(requests.length, 0);
});

test('a second observed question separates otherwise identical public candidates', async () => {
  const prior = { question: 'Quelle est la capitale italienne ?', choices: ['Rome', 'Milan'], roundId: '1' };
  respond = url => {
    if (url.includes('?')) return Response.json({ entities: [id, second].map(uuid => ({ card: { uuid } })) });
    const uuid = url.endsWith(second) ? second : id;
    return Response.json({ uuid, title: 'Europe', visibility: 1, questions: [raw().questions[1], {
      type: 'quiz', question: prior.question,
      choices: [{ answer: uuid === id ? 'Rome' : 'Turin', correct: true }, { answer: 'Milan', correct: false }]
    }] });
  };
  await assert.rejects(searchPublicQuiz(observed, 2), error => error.status === 409);
  assert.equal((await searchPublicQuiz({ ...observed, roundId: '2' }, 2, [prior])).id, id);
  assert.equal(requests.filter(request => request.url.includes('?')).length, 2);
});

test('an explicitly supplied unlisted link is read anonymously while automatic search excludes it', async () => {
  respond = () => Response.json({ ...raw(), visibility: 2 });
  await assert.rejects(fetchPublicQuiz(id), error => error.status === 404);
  assert.equal((await fetchSharedQuiz(id)).id, id);
  assert.equal(requests.at(-1).options.credentials, 'omit');
  clock += 60_001;
  respond = () => new Response('', { status: 403 });
  await assert.rejects(fetchSharedQuiz(id), error => error.status === 404);
});
