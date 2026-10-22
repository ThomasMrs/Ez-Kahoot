import assert from 'node:assert/strict';
import { normalizeText, findMatches } from '../matching.js';
import { decodeConnection, validateConnection } from '../connection.js';

const question = (index, text, answer = 'Oui') => ({ index, question: text, choices: [{ text: answer, correct: true }, { text: 'Non', correct: false }] });
const quiz = { questions: [
  question(1, 'Pourquoi étudier le cerveau d’une mouche ?'),
  question(2, 'Quel rôle joue l’intelligence artificielle dans cette expérience ?'),
  question(3, 'What is a connectome?'),
  question(4, 'What is the main purpose of this research?'),
  question(5, 'What is the main purpose of this project?')
] };
assert.equal(normalizeText('<b>Éléphant café</b> — 1&#50;'), 'elephant cafe 12');
assert.equal(normalizeText('A &lt; B'), 'a < b');
assert.equal(normalizeText('2 < 3 && 4 > 1'), '2 < 3 & & 4 > 1');
assert.equal(normalizeText('2+2?'), '2 + 2');
assert.notEqual(normalizeText('2 + 2 ?'), normalizeText('2 - 2 ?'));
assert.notEqual(normalizeText('2 × (3 + 4)'), normalizeText('2 × 3 + 4'));
assert.notEqual(normalizeText('x ≤ 3'), normalizeText('x ≥ 3'));
assert.equal(normalizeText('x &le; 3'), 'x ≤ 3');
assert.equal(normalizeText('5²'), '5 ^ ( 2 )');
assert.notEqual(normalizeText('5²'), normalizeText('52'));
assert.notEqual(normalizeText('x²'), normalizeText('x2'));
assert.notEqual(normalizeText('H₂O'), normalizeText('H2O'));
assert.equal(normalizeText('x⁻²'), 'x ^ ( - 2 )');
assert.equal(normalizeText('x&sup2;'), normalizeText('x²'));
assert.equal(normalizeText('5<sup>2</sup>'), normalizeText('5²'));
assert.equal(normalizeText('H<sub>2</sub>O'), normalizeText('H₂O'));
assert.equal(normalizeText('<script>alert(1)</script>Bonjour'), 'bonjour');
assert.equal(findMatches(quiz, 'POURQUOI ETUDIER LE CERVEAU D UNE MOUCHE?')[0].question.index, 1);
assert.equal(findMatches(quiz, 'What is a connectome?')[0].exact, true);
assert.equal(findMatches(quiz, 'Quel rôle joue intelligence artificielle dans cette expérience')[0].exact, false);
assert.equal(findMatches(quiz, 'Quelle est la météo à Paris ?').length, 0);
assert.equal(findMatches(quiz, 'main purpose').length, 0);
assert.equal(findMatches(quiz, '').length, 0);
assert.equal(findMatches(null, 'Some random question').length, 0);
const mathQuiz = { questions: [question(1, '2 + 2 ?'), question(2, 'Combien font 200 + 400 dans cette opération ?')] };
assert.equal(findMatches(mathQuiz, '2 - 2 ?').length, 0);
assert.equal(findMatches(mathQuiz, 'Combien font 200 - 400 dans cette opération ?').length, 0);
assert.equal(findMatches(mathQuiz, '2+2?')[0].exact, true);
const scriptedQuiz = { questions: [question(1, 'Combien font 5² dans cette expression ?'), question(2, 'Quelle est la valeur de x² dans cette formule ?')] };
assert.equal(findMatches(scriptedQuiz, 'Combien font 52 dans cette expression ?').length, 0);
assert.equal(findMatches(scriptedQuiz, 'Quelle est la valeur de x2 dans cette formule ?').length, 0);
assert.equal(findMatches({ questions: [question(1, 'H₂O')] }, 'H2O').length, 0);
const duplicate = { questions: [question(1, 'Même question ?'), question(2, 'Même question ?')] };
assert.equal(findMatches(duplicate, 'Meme question')[0].ambiguous, true);
assert.equal(findMatches(duplicate, 'Meme question').length, 2);
assert.equal(findMatches(duplicate, 'Meme question', 1)[0].ambiguous, true);
const code = 'EZK1.' + Buffer.from(JSON.stringify({ baseUrl: 'http://127.0.0.1:8765/', token: 'test_token_12345678901234567890' })).toString('base64url');
assert.deepEqual(decodeConnection(code), { baseUrl: 'http://127.0.0.1:8765', token: 'test_token_12345678901234567890' });
for (const baseUrl of ['https://127.0.0.1:8765', 'http://localhost:8765', 'http://evil.test', 'http://127.0.0.1:8765/path', 'http://127.0.0.1:8765?token=x', 'http://me:pass@127.0.0.1:8765']) {
  assert.throws(() => validateConnection({ baseUrl, token: 'test_token_12345678901234567890' }));
}
assert.throws(() => decodeConnection('not a code'));
assert.throws(() => validateConnection({ baseUrl: 'http://127.0.0.1:8765', token: 'short' }));
console.log('PASS: normalization, exact/fuzzy matches, no match, short queries, duplicate ambiguity, connection decoding, local-only URL validation, malformed token.');
