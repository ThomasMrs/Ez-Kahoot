import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAnswer } from '../automation.js';

const makeQuestion = (text = 'Combien font 2 + 2 ?', choices = [
  { text: '4', correct: true }, { text: '2', correct: false },
  { text: '6', correct: false }, { text: '8', correct: false }
]) => ({ id: 'q-1', type: 'quiz', question: text, choices });
const makeQuiz = question => ({ id: 'quiz-id', questions: [question || makeQuestion()] });
const makeCapture = (text = 'Combien font 2+2?', choices = [
  { text: '2', index: 0 }, { text: '8', index: 1 },
  { text: '4', index: 2 }, { text: '6', index: 3 }
]) => ({ question: text, choices });

test('identifies the visible button by its text after answer shuffling', () => {
  const decision = decideAnswer(makeQuiz(), makeCapture());
  assert.equal(decision.status, 'ready');
  assert.deepEqual(decision.targetIndexes, [2]);
  assert.equal(decision.answers[0].text, '4');
  assert.equal(decision.question.id, 'q-1');
});

test('keeps a stable signature across choice reorderings', () => {
  const first = decideAnswer(makeQuiz(), makeCapture());
  const reordered = decideAnswer(makeQuiz(), makeCapture(undefined, [
    { text: '4', index: 0 }, { text: '8', index: 1 }, { text: '2', index: 2 }, { text: '6', index: 3 }
  ]));
  assert.equal(reordered.status, 'ready');
  assert.equal(first.signature, reordered.signature);
  assert.deepEqual(reordered.targetIndexes, [0]);
});

test('signature distinguishes different questions and quiz identities', () => {
  const first = decideAnswer(makeQuiz(), makeCapture());
  const otherQuiz = makeQuiz(); otherQuiz.id = 'another-quiz';
  assert.notEqual(first.signature, decideAnswer(otherQuiz, makeCapture()).signature);
  const otherQuestion = makeQuestion('Combien font 3 + 1 ?');
  assert.notEqual(first.signature, decideAnswer(makeQuiz(otherQuestion), makeCapture(otherQuestion.question)).signature);
  const otherChoice = makeQuestion(); otherChoice.choices[3].text = '9';
  const capture = makeCapture(); capture.choices[1].text = '9';
  assert.notEqual(first.signature, decideAnswer(makeQuiz(otherChoice), capture).signature);
});

test('uses the captured round identity to distinguish repeated rounds', () => {
  const first = decideAnswer(makeQuiz(), { ...makeCapture(), roundId: 'Question 1 sur 16' });
  const second = decideAnswer(makeQuiz(), { ...makeCapture(), roundId: 'Question 2 sur 16' });
  assert.notEqual(first.signature, second.signature);
  assert.equal(first.signature, decideAnswer(makeQuiz(), { ...makeCapture(), roundId: '  Question\u00a01  sur 16  ' }).signature);
  assert.notEqual(decideAnswer(makeQuiz(), { ...makeCapture(), roundId: 1 }).signature, decideAnswer(makeQuiz(), { ...makeCapture(), roundId: 2 }).signature);
});

test('waits when no question is readable or answering is explicitly unavailable', () => {
  for (const capture of [null, {}, { question: '' }, { question: '   ' }, { question: 4 }, { ...makeCapture(), canAnswer: false }]) {
    const decision = decideAnswer(makeQuiz(), capture);
    assert.equal(decision.status, 'waiting');
    assert.deepEqual(decision.targetIndexes, []);
  }
});

test('shows known answers before buttons become active, without a click target', () => {
  const decision = decideAnswer(makeQuiz(), { ...makeCapture(), canAnswer: false, choices: [] });
  assert.equal(decision.status, 'waiting');
  assert.equal(decision.question.id, 'q-1');
  assert.deepEqual(decision.answers.map(answer => answer.text), ['4']);
  assert.deepEqual(decision.targetIndexes, []);
  assert.equal(decision.signature, undefined);
  const multiple = makeQuestion(); multiple.choices[1].correct = true;
  const multiDecision = decideAnswer(makeQuiz(multiple), { ...makeCapture(), canAnswer: false });
  assert.equal(multiDecision.status, 'waiting');
  assert.deepEqual(multiDecision.answers.map(answer => answer.text), ['4', '2']);
  assert.deepEqual(multiDecision.targetIndexes, []);
});

test('requires a loaded quiz and a fully known correction', () => {
  for (const quiz of [null, {}, { questions: [] }, { questions: [null, {}, { question: 9 }] }]) {
    assert.equal(decideAnswer(quiz, makeCapture()).status, 'unknown');
  }
  for (const correctness of [undefined, null, 'false', 1]) {
    const question = makeQuestion(); question.choices[1].correct = correctness;
    const decision = decideAnswer(makeQuiz(question), makeCapture());
    assert.equal(decision.status, 'unknown');
    assert.deepEqual(decision.targetIndexes, []);
    assert.equal(decision.answers.length, 1);
  }
  const question = makeQuestion(); question.choices.forEach(choice => { choice.correct = false; });
  assert.equal(decideAnswer(makeQuiz(question), makeCapture()).status, 'unknown');
});

test('never clicks an approximate question match or a changed math operator', () => {
  for (const query of ['Combien font 2 - 2 ?', 'Combien font 2 × 2 ?', 'Combien font 2 + 2 dans cette opération ?', 'Autre question inconnue ?']) {
    assert.equal(decideAnswer(makeQuiz(), makeCapture(query)).status, 'unknown');
  }
  const question = makeQuestion('Combien font 5² dans cette expression ?');
  assert.equal(decideAnswer(makeQuiz(question), makeCapture('Combien font 52 dans cette expression ?')).status, 'unknown');
  assert.equal(decideAnswer(makeQuiz(question), makeCapture('Combien font 5<sup>2</sup> dans cette expression ?')).status, 'ready');
});

test('duplicate exact questions remain ambiguous, including more than the result cap', () => {
  for (const count of [2, 25]) {
    const quiz = { questions: Array.from({ length: count }, () => makeQuestion()) };
    const decision = decideAnswer(quiz, makeCapture());
    assert.equal(decision.status, 'ambiguous');
    assert.deepEqual(decision.answers, []);
    assert.deepEqual(decision.targetIndexes, []);
  }
});

test('shows multiple correct answers but declines automatic submission', () => {
  const question = makeQuestion(); question.choices[1].correct = true;
  const decision = decideAnswer(makeQuiz(question), makeCapture());
  assert.equal(decision.status, 'unsupported');
  assert.deepEqual(decision.answers.map(answer => answer.text), ['4', '2']);
  assert.deepEqual(decision.targetIndexes, []);
  const explicitMulti = makeQuestion(); explicitMulti.multiSelect = true;
  assert.equal(decideAnswer(makeQuiz(explicitMulti), makeCapture()).status, 'unsupported');
});

test('declines unsupported formats and malformed choice lists without throwing', () => {
  const question = makeQuestion(); question.type = 'puzzle';
  assert.equal(decideAnswer(makeQuiz(question), makeCapture()).status, 'unsupported');
  for (const choices of [undefined, [], [{}], [null, {}], Array(21).fill({ text: '4', correct: true })]) {
    const question = makeQuestion(); question.choices = choices;
    const decision = decideAnswer(makeQuiz(question), makeCapture());
    assert.equal(decision.status, 'unsupported');
    assert.deepEqual(decision.targetIndexes, []);
  }
});

test('shows the known answer when only shapes or no option text is visible', () => {
  for (const choices of [undefined, [], [{ text: 'triangle', index: 0 }, { text: 'circle', index: 1 }]]) {
    const capture = { question: makeQuestion().question, choices };
    const decision = decideAnswer(makeQuiz(), capture);
    assert.equal(decision.status, 'unmapped');
    assert.equal(decision.answers[0].text, '4');
    assert.deepEqual(decision.targetIndexes, []);
  }
});

test('requires the whole visible answer set to match', () => {
  const wrong = makeCapture(); wrong.choices[0].text = '3';
  assert.equal(decideAnswer(makeQuiz(), wrong).status, 'unmapped');
  const missing = makeCapture(); missing.choices.pop();
  assert.equal(decideAnswer(makeQuiz(), missing).status, 'unmapped');
  const extra = makeCapture(); extra.choices.push({ text: '10', index: 4 });
  assert.equal(decideAnswer(makeQuiz(), extra).status, 'unmapped');
});

test('rejects duplicate normalized texts, duplicate indexes and empty text', () => {
  const duplicateVisible = makeCapture(); duplicateVisible.choices[1].text = '4';
  assert.equal(decideAnswer(makeQuiz(), duplicateVisible).status, 'ambiguous');
  const duplicateSource = makeQuestion(); duplicateSource.choices[1].text = '4';
  assert.equal(decideAnswer(makeQuiz(duplicateSource), makeCapture()).status, 'ambiguous');
  const duplicateIndexes = makeCapture(); duplicateIndexes.choices[0].index = 2;
  assert.equal(decideAnswer(makeQuiz(), duplicateIndexes).status, 'ambiguous');
  const empty = makeCapture(); empty.choices[0].text = '?!';
  assert.equal(decideAnswer(makeQuiz(), empty).status, 'ambiguous');
});

test('rejects invalid target indexes without relying on array order', () => {
  for (const index of [undefined, -1, 20, 1.5, '2']) {
    const capture = makeCapture(); capture.choices[2].index = index;
    assert.equal(decideAnswer(makeQuiz(), capture).status, 'unmapped');
  }
});

test('declines image-only placeholders', () => {
  for (const placeholder of ['Réponse en image', 'Réponse sans texte']) {
    const question = makeQuestion(); question.choices[0].text = placeholder;
    assert.equal(decideAnswer(makeQuiz(question), makeCapture()).status, 'unsupported');
  }
  const question = makeQuestion('Question en image');
  assert.equal(decideAnswer(makeQuiz(question), makeCapture(question.question)).status, 'unsupported');
});

test('waits for a disabled or explicitly inactive target', () => {
  for (const extra of [{ disabled: true }, { enabled: false }]) {
    const capture = makeCapture(); Object.assign(capture.choices[2], extra);
    const decision = decideAnswer(makeQuiz(), capture);
    assert.equal(decision.status, 'waiting');
    assert.equal(decision.answers[0].text, '4');
    assert.deepEqual(decision.targetIndexes, []);
  }
});

test('does not mutate the quiz or captured snapshot', () => {
  const quiz = makeQuiz(); const capture = makeCapture();
  const before = JSON.stringify({ quiz, capture });
  decideAnswer(quiz, capture);
  assert.equal(JSON.stringify({ quiz, capture }), before);
});
