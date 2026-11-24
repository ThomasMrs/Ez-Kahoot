import { normalizeText } from './matching.js';

export function roundNumber(value) {
  const match = String(value ?? '').trim().match(/^(?:question\s+)?([1-9]\d{0,3})(?:\s*(?:\/|sur|of)\s*([1-9]\d{0,3}))?$/i);
  return match && (!match[2] || Number(match[1]) <= Number(match[2])) ? match[1] : null;
}

export function cleanObservation(value) {
  if (typeof value?.question !== 'string' || !value.question.trim() || value.question.length > 1200 ||
      !Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 20 ||
      value.choices.some(text => typeof text !== 'string' || !text.trim() || text.length > 2000) ||
      value.choices.join('').length > 8000) return null;
  const choices = value.choices.map(text => text.trim());
  if (new Set(choices.map(normalizeText)).size !== choices.length || choices.some(text => !normalizeText(text))) return null;
  const placeholder = /^(?:triangle|circle|diamond|square|cercle|losange|carr[eé]|red|blue|yellow|green|r[eé]ponse (?:en image|sans texte)|proposition \d+)$/i;
  if (choices.every(text => placeholder.test(text)) || !normalizeText(value.question)) return null;
  return { question: value.question.trim(), choices, roundId: roundNumber(value.roundId) || '' };
}

export function observationKey(value) {
  return JSON.stringify([normalizeText(value.question), value.choices.map(normalizeText).sort()]);
}

export function addObservation(history, value) {
  const observed = cleanObservation(value);
  if (!observed) return history;
  const key = observationKey(observed);
  return [...history.filter(item => observationKey(item) !== key && (!observed.roundId || item.roundId !== observed.roundId)), observed].slice(-6);
}
