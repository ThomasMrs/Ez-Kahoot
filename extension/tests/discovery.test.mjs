import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = ['quiz-text.js', 'discovery.js'].map(name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, '')).join('\n');
const first = '77c46705-dab1-4ca1-a435-c287194db522';
const second = '6f5c6217-f9c5-47a6-940c-b0455260095a';
const generic = '4ecba235-3153-4362-b498-26303748f758';
const secret = 'fixture-secret-do-not-return';
function discover({ url = 'https://kahoot.it/answer/result', canonical = '', og = '', anchors = [], scripts = [], session = null, root = null, storageError = false } = {}) {
  const reads = [];
  const context = {
    URL, location: new URL(url),
    localStorage: { getItem(key) { reads.push(key); if (storageError) throw new Error('disabled'); return session === null ? null : typeof session === 'string' ? session : JSON.stringify(session); } },
    document: {
      getElementById: id => id === 'root' ? root : null,
      querySelector: selector => selector === 'link[rel="canonical"]' ? { href: canonical } : selector === 'meta[property="og:url"]' ? { content: og } : null,
      querySelectorAll: selector => selector === 'a[href]' ? anchors.map(href => ({ href })) : scripts.map(value => ({ textContent: typeof value === 'string' ? value : JSON.stringify(value) }))
    }
  };
  const result = JSON.parse(JSON.stringify(vm.runInNewContext(`${source}; discoverQuizMetadata()`, context)));
  assert.deepEqual(reads, ['kahoot-game_session'], 'no unrelated localStorage entry is read');
  assert.deepEqual(Object.keys(result).filter(key => !['revealedAnswer', 'observedQuestion'].includes(key)).sort(), ['diagnostic', 'questionCount', 'quizId', 'source', 'title']);
  assert.ok(!JSON.stringify(result).includes(secret), 'credential values are not returned');
  return result;
}
function react(features, extra = {}) {
  let calls = 0;
  const store = { getState() { calls++; return { features, services: { quizId: second, quizTitle: secret }, ...extra }; } };
  const fiber = { memoizedProps: { store }, child: null, sibling: null, alternate: null };
  fiber.child = { memoizedProps: { value: { store } }, sibling: fiber, alternate: fiber };
  return { root: { '__reactContainer$fixture': fiber }, calls: () => calls };
}

let result = discover();
assert.equal(result.quizId, null);
assert.equal(result.title, '');
assert.equal(result.questionCount, null);
assert.equal(result.source, 'none');
const flags = {};
for (let index = 0; index < 100; index++) flags[`flag${index}`] = { uuid: generic, id: generic, value: generic };
let fixture = react({ flags, gameApiId: first, liveGameId: second, uuid: generic, session: { quizId: second, token: secret }, user: { kahootId: second }, auth: { quizId: second }, services: { quizId: second } });
result = discover({ root: fixture.root, session: { numGameBlocks: 16, gameApiId: first, liveGameId: second, token: secret, quizId: '' } });
assert.equal(result.quizId, null, 'generic identifiers, game identifiers and sensitive subtrees cannot identify a quiz');
assert.equal(result.questionCount, 16);
assert.equal(result.source, 'game-session');
assert.match(result.diagnostic, /16 questions/);
assert.equal(fixture.calls(), 1, 'a repeated or cyclic React store is read once');

fixture = react({ results: { playerStats: { playerStats: { quizId: first.toUpperCase(), quizTitle: '  Biologie\n du cerveau  ', participantId: generic, userName: secret } } }, gameSession: { numGameBlocks: 16, sessionToken: secret } });
result = discover({ root: fixture.root });
assert.equal(result.quizId, first);
assert.equal(result.title, 'Biologie du cerveau');
assert.equal(result.questionCount, 16);
assert.equal(result.source, 'react-store');

result = discover({ url: `https://create.kahoot.it/details/${first}`, scripts: [{ quizId: first, quizTitle: 'Titre JSON', randomTitle: secret }], root: fixture.root });
assert.equal(result.quizId, first);
assert.equal(result.source, 'public-url');
assert.equal(result.title, 'Titre JSON', 'title precedence follows the specified source order');
for (const url of [`https://create.kahoot.it/random/${first}`, `https://evil.test/details/${first}`, `https://kahoot.it/answer?quizId=${first}`, `https://name:password@create.kahoot.it/details/${first}`]) {
  assert.equal(discover({ url }).quizId, null, `unrecognized metadata URL is ignored: ${url}`);
}
assert.equal(discover({ canonical: `https://create.kahoot.it/rest/kahoots/${first}` }).quizId, first);
assert.equal(discover({ og: `https://create.kahoot.it/share/${first}` }).quizId, first);
assert.equal(discover({ og: `https://create.kahoot.it/share/quiz-name/${first}` }).quizId, first);
assert.equal(discover({ anchors: [`https://create.kahoot.it/details/${first}`] }).quizId, first);

result = discover({ scripts: [{ quizUUID: first, quiz: { title: 'Chimie', questionCount: 12 }, title: secret, user: { quizId: second }, token: { kahootId: second }, tracking: { quizId: second } }] });
assert.equal(result.quizId, first);
assert.equal(result.title, 'Chimie');
assert.equal(result.questionCount, 12);
assert.equal(result.source, 'json-script');
result = discover({ scripts: ['not JSON', { uuid: first, title: 'Titre arbitraire', gameApiId: second }] });
assert.equal(result.quizId, null);
assert.equal(result.title, '');
result = discover({ session: { kahootUUID: first, quizName: 'Quiz de session', numGameBlocks: '16' } });
assert.equal(result.quizId, first);
assert.equal(result.title, 'Quiz de session');
assert.equal(result.questionCount, 16);

result = discover({ canonical: `https://create.kahoot.it/details/${first}`, scripts: [{ kahootId: second }] });
assert.equal(result.quizId, null);
assert.equal(result.title, '');
assert.equal(result.source, 'ambiguous');
assert.match(result.diagnostic, /Plusieurs identifiants/);
result = discover({ scripts: [{ quizId: first, nested: { kahootUUID: first } }] });
assert.equal(result.quizId, first, 'the same explicit quiz UUID in several places is not ambiguous');

let getterCalls = 0;
const withGetters = { quizTitle: 'Quiz réel' };
Object.defineProperty(withGetters, 'quizId', { enumerable: true, get() { getterCalls++; return first; } });
Object.defineProperty(withGetters, 'user', { enumerable: true, get() { getterCalls++; return { quizId: second }; } });
fixture = react(withGetters);
result = discover({ root: fixture.root, storageError: true });
assert.equal(result.title, 'Quiz réel');
assert.equal(result.quizId, null);
assert.equal(getterCalls, 0, 'accessor properties are never invoked while traversing metadata');

let nested = { quizId: first };
for (let depth = 0; depth < 9; depth++) nested = { nested };
assert.equal(discover({ root: react(nested).root }).quizId, null, 'metadata traversal is bounded to eight levels');
const huge = Array.from({ length: 4000 }, () => ({}));
huge[3999].quizId = first;
assert.equal(discover({ root: react({ entries: huge }).root }).quizId, null, 'metadata traversal is bounded to 3000 nodes');
const fiber = { memoizedState: { element: { props: { store: { getState: () => ({ features: { quiz: { title: 'Depuis React', quizId: first } } }) } } } } };
fiber.alternate = fiber;
result = discover({ root: { '__reactFiber$fixture': fiber } });
assert.equal(result.quizId, first);
assert.equal(result.title, 'Depuis React');
const resultSession = {
  numGameBlocks: 16, questionNumber: 0,
  gameBlockState: { question: { numberOfChoices: 4 }, result: { correctChoices: [1] } }
};
result = discover({ root: react({ gameSession: resultSession }).root });
assert.deepEqual(result.revealedAnswer, { phase: 'result', roundId: '1', question: '', answers: [{ text: 'Proposition 2' }] });
assert.equal(result.quizId, null, 'a revealed correction does not imply that the quiz UUID is known');
const labelledSession = {
  ...resultSession, gameBlockTitle: 'Quelle couleur ?',
  gameBlockState: { question: { numberOfChoices: 4, choices: [{ text: 'Rouge' }, { answer: 'Bleu' }, 'Jaune', { text: 'Vert' }] }, result: { correctChoices: [1, 3, 1] } }
};
result = discover({ url: 'https://kahoot.it/answer/results', root: react({ gameSession: labelledSession }).root });
assert.deepEqual(result.revealedAnswer, { phase: 'result', roundId: '1', question: 'Quelle couleur ?', answers: [{ text: 'Bleu' }, { text: 'Vert' }] });
const htmlSession = {
  ...labelledSession,
  gameBlockTitle: 'Une <strong title="x > y">caractéristique</strong> &amp; son effet&nbsp;?',
  gameBlockState: {
    question: { numberOfChoices: 4, choices: [
      'La caractéristique <i>est</i> avantageuse &amp; h&eacute;r&eacute;ditaire.',
      { text: '5<sup><b>2</b></sup> &gt; 20 et H<sub>2</sub>O' },
      { answer: 'Une ligne<br>puis <em>deux</em> &#233;tapes &#x2264; 3.' },
      'Texte<script>globalThis.unexpectedHtmlExecution = true</script><style>body{display:none}</style><img src="x" onerror="if(2>1) globalThis.unexpectedHtmlExecution=true"> visible<!-- secret -->'
    ] }, result: { correctChoices: [0, 1, 2, 3] }
  }
};
result = discover({ root: react({ gameSession: htmlSession }).root });
assert.equal(result.revealedAnswer.question, 'Une caractéristique & son effet ?');
assert.deepEqual(result.revealedAnswer.answers.map(answer => answer.text), [
  'La caractéristique est avantageuse & héréditaire.',
  '5^(2) > 20 et H_(2)O',
  'Une ligne puis deux étapes ≤ 3.',
  'Texte visible'
]);
assert.ok(!JSON.stringify(result.revealedAnswer).includes('unexpectedHtmlExecution'), 'script bodies and event attributes are discarded, never evaluated or displayed');
const escapedComparisons = {
  ...htmlSession, gameBlockTitle: 'Comparer x<y et x &lt; z',
  gameBlockState: { question: { numberOfChoices: 2, choices: ['2 &lt; 3 &amp;&amp; 4 &gt; 1', 'x&sup2; + &#x32;'] }, result: { correctChoices: [0, 1] } }
};
result = discover({ root: react({ gameSession: escapedComparisons }).root });
assert.equal(result.revealedAnswer.question, 'Comparer x<y et x < z');
assert.deepEqual(result.revealedAnswer.answers.map(answer => answer.text), ['2 < 3 && 4 > 1', 'x² + 2']);
const capitalEntities = { ...labelledSession, gameBlockTitle: '&Eacute;volution &amp; h&eacute;r&eacute;dit&eacute;' };
assert.equal(discover({ root: react({ gameSession: capitalEntities }).root }).revealedAnswer.question, 'Évolution & hérédité');
const boundedText = { ...htmlSession, gameBlockTitle: '<b>' + 'a'.repeat(1300) + '</b>', gameBlockState: {
  question: { numberOfChoices: 2, choices: ['<i>' + 'b'.repeat(1300) + '</i>', 'Texte<script>contenu non terminé'] }, result: { correctChoices: [0, 1] }
} };
result = discover({ root: react({ gameSession: boundedText }).root });
assert.equal(result.revealedAnswer.question.length, 1200);
assert.equal(result.revealedAnswer.answers[0].text, 'b'.repeat(1200), 'revealed plaintext is explicitly bounded to 1200 characters');
assert.equal(result.revealedAnswer.answers[1].text, 'Texte', 'an unterminated script body is not shown');
assert.ok(discover({ url: 'https://kahoot.it/results', root: react({ gameSession: resultSession }).root }).revealedAnswer);
for (const url of ['https://kahoot.it/answer', 'https://kahoot.it/answer/question', 'https://kahoot.it/podium']) {
  assert.equal(discover({ url, root: react({ gameSession: labelledSession }).root }).revealedAnswer, undefined, 'correctChoices are not exposed before/after the recognized result screen');
}
for (const choices of [[], [-1], [4], [1.5], ['1'], [1, 4]]) {
  const invalid = { ...resultSession, gameBlockState: { ...resultSession.gameBlockState, result: { correctChoices: choices } } };
  assert.equal(discover({ root: react({ gameSession: invalid }).root }).revealedAnswer, undefined);
}
for (const numberOfChoices of [1, 21, '4', null]) {
  const invalid = { ...resultSession, gameBlockState: { ...resultSession.gameBlockState, question: { numberOfChoices } } };
  assert.equal(discover({ root: react({ gameSession: invalid }).root }).revealedAnswer, undefined);
}
assert.equal(discover({ session: resultSession }).revealedAnswer, undefined, 'stored corrections are never reused as live result state');
assert.equal(discover({ scripts: [{ gameSession: resultSession }] }).revealedAnswer, undefined, 'JSON metadata cannot supply a live result');
assert.equal(discover({ root: react({ results: { correctChoices: [1] }, gameSession: { ...resultSession, questionNumber: -1 } }).root }).revealedAnswer, undefined);

// Received question data may identify a public quiz without disclosing a correction.
for (const path of ['/gameblock', '/gameblock/', '/v2/gameblock', '/v2/gameblock/', '/answer/result', '/answer/results/']) {
  const observation = discover({ url: `https://kahoot.it${path}`, root: react({ gameSession: htmlSession }).root });
  assert.deepEqual(observation.observedQuestion, {
    question: 'Une caractéristique & son effet ?',
    choices: [
      'La caractéristique est avantageuse & héréditaire.', '5^(2) > 20 et H_(2)O',
      'Une ligne puis deux étapes ≤ 3.', 'Texte visible'
    ], roundId: '1'
  });
  assert.deepEqual(Object.keys(observation.observedQuestion).sort(), ['choices', 'question', 'roundId']);
  if (/gameblock/.test(path)) assert.equal(observation.revealedAnswer, undefined, 'active question metadata never includes old correctChoices');
}
for (const path of ['/answer', '/answer/question', '/getready', '/results', '/podium', '/gameblock/extra', '/v3/gameblock', '/answer/result/extra']) {
  assert.equal(discover({ url: `https://kahoot.it${path}`, root: react({ gameSession: htmlSession }).root }).observedQuestion, undefined, `observed text route is allowlisted: ${path}`);
}
for (const url of ['https://evil.test/gameblock', 'http://kahoot.it/gameblock', 'https://kahoot.it.evil.test/answer/result']) {
  assert.equal(discover({ url, root: react({ gameSession: htmlSession }).root }).observedQuestion, undefined, 'observed text requires an HTTPS Kahoot player origin');
}
assert.equal(discover({ session: htmlSession }).observedQuestion, undefined, 'stored question data is not treated as current received text');
assert.equal(discover({ scripts: [{ gameSession: htmlSession }] }).observedQuestion, undefined, 'JSON scripts do not supply current question text');
assert.equal(discover({ root: react({ gameSession: resultSession }).root }).observedQuestion, undefined, 'a correction without question text and choices is not an observation');
const nextRound = {
  questionNumber: 4, gameBlockState: {
    gameBlockTitle: 'Quelle est la nouvelle question ?',
    question: { numberOfChoices: 2, choices: [{ answer: 'Nouveau choix A' }, { text: 'Nouveau choix B' }] },
    result: { correctChoices: [1], text: 'Ancien résultat' }
  }
};
result = discover({ url: 'https://kahoot.it/gameblock', root: react({ gameSession: nextRound }).root });
assert.deepEqual(result.observedQuestion, { question: 'Quelle est la nouvelle question ?', choices: ['Nouveau choix A', 'Nouveau choix B'], roundId: '5' });
assert.equal(result.revealedAnswer, undefined, 'the previous result does not become a correction for a new active round');
const observedBounds = { questionNumber: 9999, gameBlockState: {
  gameBlockTitle: '<i>' + 'Q'.repeat(1300) + '</i>', question: { choices: ['A'.repeat(1300), 'B'] }
} };
result = discover({ url: 'https://kahoot.it/gameblock', root: react({ gameSession: observedBounds }).root });
assert.equal(result.observedQuestion.question.length, 1200);
assert.equal(result.observedQuestion.choices[0].length, 1200);
assert.equal(result.observedQuestion.roundId, '10000');
for (const questionNumber of [-1, 10000, '1', 1.5, null, undefined]) {
  assert.equal(discover({ root: react({ gameSession: { ...labelledSession, questionNumber } }).root }).observedQuestion, undefined);
}
for (const choices of [[], ['Un seul choix'], Array.from({ length: 21 }, (_, index) => String(index)), ['A', ''], ['<i></i>', 'B'], ['Réponse en image', 'B'], ['Réponse sans texte', 'B'], ['Proposition 1', 'B'], ['triangle', 'circle'], [null, 'B'], [1, 'B'], [{ image: 'image-id' }, 'B']]) {
  const malformed = { ...labelledSession, gameBlockState: { question: { choices } } };
  assert.equal(discover({ root: react({ gameSession: malformed }).root }).observedQuestion, undefined, 'partial, malformed or placeholder options cannot identify a quiz');
}
for (const title of ['', 'Question en image', 'Question sans titre', 'Question 2 sur 16', '<script>not a question</script>']) {
  assert.equal(discover({ root: react({ gameSession: { ...labelledSession, gameBlockTitle: title } }).root }).observedQuestion, undefined);
}
for (const numberOfChoices of [1, 3, 21, '4', null]) {
  const mismatch = { ...labelledSession, gameBlockState: { ...labelledSession.gameBlockState, question: { ...labelledSession.gameBlockState.question, numberOfChoices } } };
  assert.equal(discover({ root: react({ gameSession: mismatch }).root }).observedQuestion, undefined);
}
let choiceGetterCalls = 0;
const choicesWithGetter = ['A', 'B'];
Object.defineProperty(choicesWithGetter, '0', { get() { choiceGetterCalls++; return secret; } });
const getterSession = { ...labelledSession, gameBlockState: { question: { numberOfChoices: 2, choices: choicesWithGetter } } };
assert.equal(discover({ url: 'https://kahoot.it/gameblock', root: react({ gameSession: getterSession }).root }).observedQuestion, undefined);
assert.equal(choiceGetterCalls, 0, 'received choice accessors are not invoked');
assert.equal(discover({ root: react({ gameSession: labelledSession, other: { gameSession: nextRound } }).root }).observedQuestion, undefined, 'conflicting current question records are not selected arbitrarily');
assert.ok(discover({ root: react({ gameSession: labelledSession, other: { gameSession: labelledSession } }).root }).observedQuestion, 'identical received records are deduplicated');
console.log('PASS: découverte MAIN, UUID sémantiques, priorité des sources, ambiguïtés, comptage, React cyclique, secrets ignorés et parcours borné.');
