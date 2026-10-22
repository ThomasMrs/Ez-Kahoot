import assert from 'node:assert/strict';
import test from 'node:test';
import { activateAnswer } from '../active-choice.js';

function setup() {
  globalThis.location = new URL('https://kahoot.it/answer');
  let clicks = 0;
  const button = {
    disabled: false, isConnected: true, hidden: false, inert: false, parentElement: null,
    style: { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' },
    attributes: {}, getAttribute(name) { return this.attributes[name] ?? null; },
    closest: () => button, matches: () => true, getClientRects: () => [{}], click: () => clicks++
  };
  const capture = { question: '2 + 2 ?', roundId: '1', phase: 'question', canAnswer: true,
    choices: [{ index: 0, text: '4', selector: 'button[data-functional-selector^="answer-"]', elementIndex: 0 }] };
  globalThis.document = { hidden: false, querySelectorAll: () => [button] };
  globalThis.getComputedStyle = element => element.style;
  return { button, capture, readPage: () => structuredClone(capture), clicks: () => clicks };
}

test('clicks the freshly read, enabled answer button once', () => {
  const context = setup();
  assert.equal(activateAnswer(context.capture, 0, context.readPage).clicked, true);
  assert.equal(context.clicks(), 1);
});
test('refuses a changed question, round or answer set', () => {
  for (const change of [value => { value.question = '2 - 2 ?'; }, value => { value.roundId = '2'; }, value => { value.choices[0].text = '0'; }]) {
    const context = setup();
    const fresh = structuredClone(context.capture); change(fresh);
    assert.equal(activateAnswer(context.capture, 0, () => fresh).clicked, false);
    assert.equal(context.clicks(), 0);
  }
});
test('refuses results, a hidden tab or a non-Kahoot origin', () => {
  for (const change of [() => { location.pathname = '/answer/result'; }, () => { document.hidden = true; }, () => { globalThis.location = new URL('https://evil.test/answer'); }]) {
    const context = setup(); change();
    assert.equal(activateAnswer(context.capture, 0, context.readPage).clicked, false);
    assert.equal(context.clicks(), 0);
  }
});
test('refuses disabled, detached, transparent and pointer-blocked buttons', () => {
  for (const change of [button => { button.disabled = true; }, button => { button.isConnected = false; },
    button => { button.attributes['aria-disabled'] = 'true'; }, button => { button.style.opacity = '0'; },
    button => { button.style.pointerEvents = 'none'; }, button => { button.hidden = true; }]) {
    const context = setup(); change(context.button);
    assert.equal(activateAnswer(context.capture, 0, context.readPage).clicked, false);
    assert.equal(context.clicks(), 0);
  }
});
test('refuses unsupported selectors, indices and non-button elements', () => {
  const context = setup();
  assert.equal(activateAnswer(context.capture, -1, context.readPage).clicked, false);
  context.capture.choices[0].selector = '.reaction-prompt-button';
  assert.equal(activateAnswer(context.capture, 0, context.readPage).clicked, false);
  context.capture.choices[0].selector = 'button[data-functional-selector^="answer-"]';
  context.button.matches = () => false;
  assert.equal(activateAnswer(context.capture, 0, context.readPage).clicked, false);
  assert.equal(context.clicks(), 0);
});
