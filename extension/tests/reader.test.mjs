import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../reader.js', import.meta.url), 'utf8');
const textNode = value => ({ nodeType: 3, textContent: value });
function element(value, options = {}) {
  const node = {
    nodeType: 1, tagName: options.tagName || 'H2', innerText: value,
    parentElement: options.parent || null, childNodes: options.children || [textNode(value)],
    hidden: !!options.hidden, inert: !!options.inert, style: { display: 'block', visibility: 'visible', opacity: '1', ...options.style },
    getClientRects: () => options.noRects ? [] : [{}],
    getAttribute: name => options.attributes?.[name] ?? null,
    hasAttribute: name => Object.hasOwn(options.attributes || {}, name),
    closest(selector) {
      if (selector !== '[aria-hidden="true"]') return null;
      for (let current = this; current; current = current.parentElement) if (current.getAttribute('aria-hidden') === 'true') return current;
      return null;
    },
    querySelector: selector => selector === 'sup, sub' && options.hasScript ? {} : null
  };
  if (options.checkVisibility !== undefined) node.checkVisibility = () => options.checkVisibility;
  return node;
}
function capture(questions, choices = [], url = 'https://kahoot.it/v2/gameblock') {
  const document = {
    title: 'Fixture de lecture',
    querySelector: () => null,
    querySelectorAll: selector => {
      if (selector === '[data-functional-selector="question-title"]') return questions;
      if (selector === 'button[data-functional-selector^="answer-"]') return choices;
      return [];
    }
  };
  return vm.runInNewContext(source, { document, location: new URL(url), URL, getComputedStyle: node => node.style });
}

assert.equal(capture([element('2+2?')]).question, '2+2?');
assert.equal(capture([element('Loading…'), element('Quelle est la bonne réponse ?')]).question, 'Quelle est la bonne réponse ?');
for (const parentOptions of [
  { style: { opacity: '0' } }, { style: { display: 'none' } }, { style: { visibility: 'hidden' } },
  { hidden: true }, { inert: true }, { attributes: { 'aria-hidden': 'true' } }
]) {
  const hidden = element('Ancienne question masquée ?', { parent: element('', parentOptions) });
  assert.equal(capture([hidden, element('Question actuelle visible ?')]).question, 'Question actuelle visible ?');
}
assert.equal(capture([element('Question hors écran ?', { noRects: true })]).question, '');
assert.equal(capture([element('Question refusée ?', { checkVisibility: false })]).question, '');
const duplicate = element('Même réponse');
assert.equal(capture([element('Question visible ?')], [duplicate, duplicate, element('Même réponse')]).choices.length, 2);
assert.equal(capture([], [element('triangle'), element('circle')]).choices.length, 0);
const superscript = element('2', { tagName: 'SUP' });
const subscript = element('2', { tagName: 'SUB' });
assert.equal(capture([element('52?', { hasScript: true, children: [textNode('5'), superscript, textNode('?')] })]).question, '5 ^(2) ?');
assert.equal(capture([element('H2O?', { hasScript: true, children: [textNode('H'), subscript, textNode('O?')] })]).question, 'H _(2) O?');
const hiddenScript = element('9', { tagName: 'SUP', style: { opacity: '0' } });
assert.equal(capture([element('5?', { hasScript: true, children: [textNode('5'), hiddenScript, textNode('?')] })]).question, '5?');
assert.equal(capture([], [], 'https://create.kahoot.it/details/77c46705-dab1-4ca1-a435-c287194db522').quizId, '77c46705-dab1-4ca1-a435-c287194db522');
assert.equal(capture([], [], 'https://evil.test/details/77c46705-dab1-4ca1-a435-c287194db522').quizId, null);
const resultCapture = capture([element('Ancienne question visible ?')], [element('Réponse')], 'https://kahoot.it/answer/result');
assert.equal(resultCapture.question, '');
assert.equal(resultCapture.choices.length, 0);
assert.equal(resultCapture.canAnswer, false);
assert.equal(resultCapture.phase, 'result');
assert.equal(capture([element('Question visible ?')]).phase, 'question');
assert.equal(capture([element('Question visible ?')]).canAnswer, false);
console.log('PASS: lecteur DOM simulé, texte mathématique, exposants et indices HTML, visibilité des ancêtres, doublons distincts, formes seules, URL publique.');
