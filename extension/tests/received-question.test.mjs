import assert from 'node:assert/strict';
import test from 'node:test';
import { withReceivedQuestion } from '../received-question.js';
import { decideAnswer } from '../automation.js';

const capture = { url: 'https://kahoot.it/gameblock', question: '', roundId: 'Question 2 sur 8', choices: [], phase: 'waiting' };
const received = { path: '/gameblock', expiresAt: 3000, observedQuestion: { question: 'Capitale de la France ?', choices: ['Paris', 'Lyon'], roundId: '2' } };
const quiz = { questions: [{ question: received.observedQuestion.question, choices: [{ text: 'Paris', correct: true }, { text: 'Lyon', correct: false }] }] };

test('recent received question text reveals an answer for the same visible round without enabling clicks', () => {
  const next = withReceivedQuestion(capture, received, 1000);
  const decision = decideAnswer(quiz, next);
  assert.equal(next.question, received.observedQuestion.question);
  assert.equal(next.canAnswer, false);
  assert.equal(decision.answers[0].text, 'Paris');
  assert.deepEqual(decision.targetIndexes, []);
  assert.equal(capture.question, '');
});

test('stale, missing or mismatched round information never carries the answer into another question', () => {
  for (const next of [{ ...capture, roundId: 'Question 3 sur 8' }, { ...capture, roundId: '' },
    { ...capture, roundId: '2 sur 1' }, { ...capture, url: 'https://kahoot.it/answer/result' },
    { ...capture, question: 'Question réellement visible' }]) {
    assert.equal(withReceivedQuestion(next, received, 1000), next);
  }
  assert.equal(withReceivedQuestion(capture, received, 3000), capture);
});
