import { plainQuizText } from './quiz-text.js';

// Parse only quiz fields in received JSON. No raw frames, identity or credentials survive.
export function parseReceivedQuiz(raw, previous = null) {
  if (typeof raw !== 'string' || raw.length > 512 * 1024) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const queue = Array.isArray(parsed) ? parsed.slice(0, 50) : [parsed];
  let result = null;
  for (let i = 0; i < queue.length && i < 100; i++) {
    const value = queue[i];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const name of ['data', 'content', 'gameBlockData']) {
      let nested = value[name];
      if (typeof nested === 'string' && nested.length <= 512 * 1024) {
        try { nested = JSON.parse(nested); } catch { continue; }
      }
      if (nested && typeof nested === 'object' && !Array.isArray(nested) && queue.length < 100) queue.push(nested);
    }
    const index = value.questionIndex ?? value.questionNumber;
    const roundId = Number.isInteger(index) && index >= 0 && index < 500 ? String(index + 1) : null;
    const rawQuestion = typeof value.question === 'object' && value.question ? value.question : value;
    const question = plainQuizText(typeof value.question === 'string' ? value.question : rawQuestion.title ?? value.gameBlockTitle);
    const rawChoices = rawQuestion.choices ?? rawQuestion.options;
    const choices = Array.isArray(rawChoices) && rawChoices.length >= 2 && rawChoices.length <= 20
      ? rawChoices.map(c => plainQuizText(typeof c === 'string' ? c : c?.text ?? c?.answer)) : [];
    if (roundId && question && question.length <= 1200 && choices.length >= 2 &&
        choices.every(c => c && c.length <= 2000) && choices.join('').length <= 8000) {
      result = { ...result, observedQuestion: { question, choices, roundId } };
    }
    const observed = result?.observedQuestion || previous?.observedQuestion;
    const correct = value.correctChoices ?? value.result?.correctChoices;
    // A result without an explicit round is never attached to the previous question.
    if (roundId && observed?.roundId === roundId && Array.isArray(correct) && correct.length > 0 &&
        correct.length <= 20 && correct.every(n => Number.isInteger(n) && n >= 0 && n < observed.choices.length)) {
      result = { ...result, observedQuestion: observed, revealedAnswer: { phase: 'result', roundId,
        question: observed.question, answers: [...new Set(correct)].map(n => ({ text: observed.choices[n] })) } };
    }
    const id = value.quizId ?? value.kahootId;
    if (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      result = { ...result, quizId: id.toLowerCase() };
    }
    const count = value.numGameBlocks ?? value.questionCount;
    if (Number.isInteger(count) && count > 0 && count <= 500) result = { ...result, questionCount: count };
  }
  return result;
}
