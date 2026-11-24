import { normalizeText } from './matching.js';
import { cleanObservation, observationKey } from './observations.js';

const KEY = 'ezkCorrectionMemoryV1';
const MAX_RECORDS = 100;
const MAX_BYTES = 1024 * 1024;
let queue = Promise.resolve();
const serial = task => {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
};

function validRecord(value) {
  const observed = cleanObservation(value);
  if (!observed || !Array.isArray(value.variants) || !value.variants.length || value.variants.length > 4 ||
      !Number.isFinite(value.updatedAt) || value.updatedAt <= 0 || value.source !== 'revealed-result') return null;
  const choices = new Set(observed.choices.map(normalizeText));
  const variants = value.variants.map(answers => Array.isArray(answers) && answers.length && answers.length <= 20 &&
    answers.every(text => typeof text === 'string' && choices.has(normalizeText(text))) ? [...new Set(answers.map(normalizeText))].sort() : null);
  if (variants.some(value => !value)) return null;
  return { ...observed, variants: [...new Map(variants.map(variant => [JSON.stringify(variant), variant])).values()],
    updatedAt: value.updatedAt, source: 'revealed-result', conflict: value.conflict === true };
}

async function read() {
  const stored = (await chrome.storage.local.get(KEY))[KEY];
  if (!Array.isArray(stored)) return [];
  return stored.slice(0, MAX_RECORDS).map(validRecord).filter(Boolean);
}

async function write(records) {
  const next = records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECORDS);
  while (new TextEncoder().encode(JSON.stringify(next)).length > MAX_BYTES) next.pop();
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export const listCorrections = () => serial(read);
export const clearCorrections = () => serial(() => chrome.storage.local.remove(KEY));
export const deleteCorrection = key => serial(async () => write((await read()).filter(item => observationKey(item) !== key)));

export function rememberCorrection(observed, revealed) {
  const clean = cleanObservation(observed);
  if (!clean || !clean.roundId || revealed?.phase !== 'result' || clean.roundId !== revealed.roundId ||
      (revealed.question && normalizeText(revealed.question) !== normalizeText(clean.question)) ||
      !Array.isArray(revealed.answers) || !revealed.answers.length || revealed.answers.length > 20) return Promise.resolve(false);
  const choices = new Set(clean.choices.map(normalizeText));
  const answers = revealed.answers.map(answer => typeof answer?.text === 'string' ? normalizeText(answer.text) : '');
  if (answers.some(answer => !answer || !choices.has(answer))) return Promise.resolve(false);
  const variant = [...new Set(answers)].sort();
  return serial(async () => {
    const records = await read();
    const key = observationKey(clean);
    const previous = records.find(record => observationKey(record) === key);
    const variants = previous?.variants || [];
    if (previous && variants.some(existing => JSON.stringify(existing) === JSON.stringify(variant))) return true;
    if (!variants.some(existing => JSON.stringify(existing) === JSON.stringify(variant))) variants.push(variant);
    const conflict = previous?.conflict || variants.length > 1;
    const record = { ...clean, variants: variants.slice(0, 4), conflict, updatedAt: Date.now(), source: 'revealed-result' };
    await write([record, ...records.filter(record => observationKey(record) !== key)]);
    return true;
  });
}

export async function lookupCorrection(observed) {
  const clean = cleanObservation(observed);
  if (!clean) return null;
  const record = (await listCorrections()).find(record => observationKey(record) === observationKey(clean));
  if (!record || record.conflict || record.variants.length !== 1) return null;
  const answers = new Set(record.variants[0]);
  return { id: 'memory-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(observationKey(clean))))).map(n => n.toString(16).padStart(2, '0')).join(''), title: 'Correction mémorisée après une question', scope: 'question',
    slideCount: 0, skippedCount: 0, questions: [{ id: 'remembered', index: 1, type: 'quiz', question: clean.question,
      multiSelect: answers.size > 1, choices: clean.choices.map(text => ({ text, correct: answers.has(normalizeText(text)) })) }] };
}
