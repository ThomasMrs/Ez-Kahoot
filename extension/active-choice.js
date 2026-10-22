import { normalizeText } from './matching.js';

const answerSelectors = new Set([
  'button[data-functional-selector^="answer-"]', '[data-functional-selector^="answer-option-"]',
  '[data-functional-selector^="answer-button-"]', '[data-testid^="answer-option-"]', '.answer-option', '.answer-button'
]);

function sameCapture(left, right) {
  return normalizeText(left?.question) === normalizeText(right?.question) &&
    String(left?.roundId || '') === String(right?.roundId || '') &&
    JSON.stringify(left?.choices?.map(choice => normalizeText(choice.text))) ===
      JSON.stringify(right?.choices?.map(choice => normalizeText(choice.text)));
}

export function activateAnswer(capture, index, readPage) {
  const fail = message => ({ clicked: false, message });
  if (location.protocol !== 'https:' || !['kahoot.it', 'create.kahoot.it', 'play.kahoot.it'].includes(location.hostname)) return fail('Ouvre un onglet Kahoot.');
  if (document.hidden || /\/(?:result|results|podium|ranking|scoreboard|lobby|join)(?:\/|$)/i.test(location.pathname)) return fail('En attente de la prochaine question.');
  if (typeof readPage !== 'function' || !Number.isInteger(index) || index < 0) return fail('Lecture à actualiser.');
  const current = readPage();
  if (!sameCapture(capture, current) || !current.canAnswer || current.phase !== 'question') return fail('La question a changé.');
  const choice = current.choices[index];
  if (!choice || !answerSelectors.has(choice.selector) || !Number.isInteger(choice.elementIndex) || choice.elementIndex < 0 || choice.elementIndex > 100) return fail('Bouton non identifié.');
  const element = document.querySelectorAll(choice.selector)[choice.elementIndex];
  const button = element?.closest('button,[role="button"]') || element;
  if (!button || !button.matches('button,[role="button"]') || !button.isConnected || !button.getClientRects().length || button.disabled || button.getAttribute('aria-disabled') === 'true') return fail('Le bouton ne peut plus être utilisé.');
  for (let node = button; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0 || style.pointerEvents === 'none') return fail('Le bouton est masqué ou désactivé.');
  }
  button.click();
  return { clicked: true, message: 'Réponse envoyée.' };
}
