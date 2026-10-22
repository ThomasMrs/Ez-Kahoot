import assert from 'node:assert/strict';
import { mountLivePanel } from '../live-panel.js';

// A small DOM double keeps lifecycle and click de-duplication tests dependency-free.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.listeners = {}; this.hidden = false; this.isConnected = true; this.textContent = ''; }
  append(...nodes) { for (const node of nodes) { node.parent = this; node.isConnected = true; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  attachShadow() { this.shadowRoot = new Element('shadow-root'); return this.shadowRoot; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter(listener => listener !== callback); }
  dispatchEvent(event) { for (const callback of this.listeners[event.type] || []) callback(event); }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; }
  focus() { /* No real browser focus is used by this unit fixture. */ }
}
const find = (node, predicate) => predicate(node) ? node : node.children.map(child => find(child, predicate)).find(Boolean);
const timers = new Set();
const observers = [];
const windowListeners = {};
const root = new Element('html');
const documentListeners = {};
const documentFixture = {
  documentElement: root, activeElement: new Element('body'), hidden: false,
  createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }),
  getElementById: id => find(root, node => node.id === id),
  addEventListener(name, callback) { (documentListeners[name] ||= []).push(callback); },
  removeEventListener(name, callback) { documentListeners[name] = (documentListeners[name] || []).filter(listener => listener !== callback); }
};
Object.assign(globalThis, {
  document: documentFixture,
  window: { addEventListener(name, callback) { (windowListeners[name] ||= []).push(callback); }, removeEventListener(name, callback) { windowListeners[name] = (windowListeners[name] || []).filter(listener => listener !== callback); } },
  location: { href: 'https://kahoot.it/answer', pathname: '/answer' },
  MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  setInterval(callback) { const timer = { callback }; timers.add(timer); return timer; },
  clearInterval(timer) { timers.delete(timer); }
});

const quiz = { title: 'Quiz test', questions: [{ question: 'Question de test' }] };
let capture = { url: 'https://kahoot.it/answer', question: 'Quelle réponse ?', state: 'ready' };
let clicks = 0;
const decideAnswer = (_, value) => ({ status: value.state || 'waiting', question: value.question, answers: value.question ? [{ text: 'Réponse correcte' }] : [], targetIndexes: value.state === 'ready' ? [1] : [], signature: 'same-question-and-choices', message: 'Corrigé chargé.' });
const activateAnswer = () => { clicks++; return { clicked: true, message: 'Choix cliqué.' }; };
const create = options => mountLivePanel({ quiz, readPage: () => capture, decideAnswer, activateAnswer, ...options });
const get = (instance, label) => find(instance.host.shadowRoot, node => node.getAttribute?.('aria-label') === label || node.textContent === label);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

let panel = create();
assert.equal(clicks, 0, 'mounting does not enable automatic clicking');
assert.ok(get(panel, 'Réponse correcte'));
const once = get(panel, 'Répondre une fois');
once.click();
await flush();
assert.equal(clicks, 1);
assert.equal(once.disabled, true);
panel.refresh();
capture = { ...capture, question: 'Texte qui change sans résultat intermédiaire' };
panel.refresh();
assert.equal(clicks, 1, 'DOM text or choices changing within the round do not re-arm the click');
capture = { url: 'https://kahoot.it/answer/result', question: '', state: 'waiting' };
panel.refresh();
capture = { url: 'https://kahoot.it/answer', question: 'Quelle réponse ?', state: 'ready' };
panel.refresh();
once.click();
await flush();
assert.equal(clicks, 2, 'a visible results phase permits the next round, including a repeated question');
const auto = find(panel.host.shadowRoot, node => node.type === 'checkbox');
auto.checked = true;
auto.dispatchEvent(new Event('change'));
assert.equal(clicks, 2, 'enabling auto after a manual answer does not click twice');
capture = { url: 'https://kahoot.it/answer/result', question: 'Résultat ancien toujours dans le DOM', state: 'ready' };
panel.refresh();
assert.equal(clicks, 2, 'results path always blocks the click, even with stale question text');
capture = { url: 'https://kahoot.it/answer', question: 'Nouvelle question ?', state: 'ready' };
documentFixture.hidden = true;
panel.refresh();
assert.equal(clicks, 2, 'hidden document pauses auto');
documentFixture.hidden = false;
panel.refresh();
await flush();
assert.equal(clicks, 3, 'the next visible ready round clicks once');
get(panel, 'Réduire Ez-Kahoot').click();
assert.equal(get(panel, 'Développer Ez-Kahoot').getAttribute('aria-expanded'), 'false');
get(panel, 'Développer Ez-Kahoot').click();
panel.dispose();
assert.equal(timers.size, 0);
assert.equal(observers.at(-1).disconnected, true);
assert.equal(documentListeners.visibilitychange.length, 0);

capture = { url: 'https://kahoot.it/answer', question: 'Choix illisibles ?', state: 'unmapped' };
panel = create({ initialAutoClick: true });
assert.equal(clicks, 3, 'unmapped questions are displayed but never clicked');
assert.equal(get(panel, 'Répondre une fois').disabled, true);
const replacement = create();
assert.equal(panel.host.isConnected, false, 're-injection disposes the previous instance');
assert.equal(timers.size, 1, 'only one observer loop remains after replacement');
get(replacement, 'Fermer Ez-Kahoot').click();
assert.equal(root.children.length, 0);
assert.equal(timers.size, 0);
assert.equal(observers.every(observer => observer.disconnected), true);
let metadataCalls = 0;
let suppliedSnapshot;
let finishMetadata;
const metadataPromise = new Promise(resolve => { finishMetadata = resolve; });
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const discovery = create({ quiz: null, onRefresh: snapshot => { metadataCalls++; suppliedSnapshot = snapshot; return metadataPromise; } });
await flush();
assert.ok(get(discovery, 'Recherche du quiz…'));
assert.equal(get(discovery, 'Répondre une fois').disabled, true);
assert.equal(metadataCalls, 1);
assert.equal(suppliedSnapshot.quiz, null);
discovery.refresh();
discovery.setDiscoveryStatus('Quiz non transmis par cette page');
assert.ok(get(discovery, 'Quiz non transmis par cette page'));
assert.equal(metadataCalls, 1, 'status refresh cannot create a metadata callback loop');
now += 2000;
discovery.refresh();
await flush();
assert.equal(metadataCalls, 1, 'pending discovery callback never overlaps');
finishMetadata();
await flush();
discovery.refresh();
await flush();
assert.equal(metadataCalls, 2);
discovery.setQuiz(quiz);
await flush();
assert.equal(metadataCalls, 2, 'setQuiz refresh obeys the one-second cooldown');
now += 1100;
discovery.refresh();
await flush();
assert.equal(metadataCalls, 3);
discovery.dispose();
Date.now = realNow;
assert.equal(timers.size, 0);
capture = { url: 'https://kahoot.it/answer/result', phase: 'result', roundId: '1', question: '', state: 'waiting' };
const revealedPanel = create({ quiz: null, initialAutoClick: true });
revealedPanel.setRevealedAnswer({ phase: 'result', roundId: '1', question: '', answers: [{ text: 'Proposition 2' }] });
assert.ok(get(revealedPanel, 'Question terminée'));
assert.ok(get(revealedPanel, 'Correction reçue après la question.'));
assert.ok(get(revealedPanel, 'Proposition 2'));
assert.equal(get(revealedPanel, 'Répondre une fois').disabled, true);
assert.equal(clicks, 3, 'a revealed answer is displayed but never clicked');
capture = { ...capture, roundId: 'Question 2 sur 16' };
revealedPanel.refresh();
assert.equal(get(revealedPanel, 'Proposition 2'), undefined, 'an old revealed answer disappears as soon as the current round changes');
revealedPanel.setRevealedAnswer({ phase: 'result', roundId: '1', question: '', answers: [{ text: 'Réponse retardée de la question 1' }] });
assert.equal(get(revealedPanel, 'Réponse retardée de la question 1'), undefined, 'an async result from round 1 is rejected on round 2');
for (const roundId of ['2', 2, '2/16', 'Question 2 sur 16', 'Question 2 of 16']) {
  capture = { ...capture, roundId };
  revealedPanel.setRevealedAnswer({ phase: 'result', roundId: '2', question: '', answers: [{ text: 'Correction actuelle' }] });
  assert.ok(get(revealedPanel, 'Correction actuelle'), `recognized current round format: ${roundId}`);
}
for (const change of [
  { roundId: '' }, { roundId: 'Score 2' }, { roundId: '2 / 1' }, { roundId: '0' },
  { roundId: '2', phase: 'question' }, { roundId: '2', url: 'https://kahoot.it/answer', phase: 'result' }
]) {
  capture = { url: 'https://kahoot.it/answer/result', phase: 'result', roundId: '2', question: '', state: 'waiting', ...change };
  revealedPanel.setRevealedAnswer({ phase: 'result', roundId: '2', question: '', answers: [{ text: 'Correction hors phase' }] });
  assert.equal(get(revealedPanel, 'Correction hors phase'), undefined, 'missing/invalid round, wrong phase or wrong route blocks revealed answers');
}
capture = { url: 'https://kahoot.it/answer', question: '', state: 'waiting' };
revealedPanel.refresh();
assert.equal(get(revealedPanel, 'Proposition 2'), undefined, 'revealed answer is cleared when leaving results');
capture = { url: 'https://kahoot.it/answer/result', question: '', state: 'waiting' };
revealedPanel.refresh();
assert.equal(get(revealedPanel, 'Proposition 2'), undefined, 'revealed answers are never learned or reused in a later result');
revealedPanel.setRevealedAnswer({ phase: 'question', roundId: '2', answers: [{ text: 'Fausse correction anticipée' }] });
assert.equal(get(revealedPanel, 'Fausse correction anticipée'), undefined);
revealedPanel.dispose();
assert.equal(timers.size, 0);
console.log('PASS: panneau live, affichage, clic manuel/auto, verrou par manche, résultat, onglet masqué, réduction et nettoyage complet.');
