const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', times: '×', divide: '÷', minus: '−', sup1: '¹', sup2: '²', sup3: '³' };
const superscripts = Object.fromEntries([...('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ')].map((character, index) => [character, [...('0123456789+-=()ni')][index]]));
const subscripts = Object.fromEntries([...('₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎')].map((character, index) => [character, [...('0123456789+-=()')][index]]));

function preserveScripts(value) {
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+/g, group => ` ^(${[...group].map(character => superscripts[character]).join('')}) `)
    .replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+/g, group => ` _(${[...group].map(character => subscripts[character]).join('')}) `);
}

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity, key) => {
    if (key[0] !== '#') return entities[key.toLowerCase()] ?? entity;
    const hex = key[1]?.toLowerCase() === 'x';
    const number = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
  });
}

export function normalizeText(value) {
  return preserveScripts(decodeEntities(String(value ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, ' ^($1) ')
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, ' _($1) ')
    .replace(/<\/?(?:b|strong|em|i|u|s|del|mark|small|span|p|div|br|sub|sup|code|pre|a|ul|ol|li|h[1-6])(?:\s[^<>]*?)?\s*\/?>/gi, ' ')))
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[−﹣－]/g, '-')
    .replace(/[^\p{L}\p{N}+\-=<>≤≥≠×÷/^_%*&|()[\]{}]+/gu, ' ')
    .replace(/([+\-=<>≤≥≠×÷/^_%*&|()[\]{}])/g, ' $1 ')
    .replace(/\s+/g, ' ').trim();
}

function operatorSignature(text) {
  return (text.match(/[+\-=<>≤≥≠×÷/^_%*&|()[\]{}]/g) || []).join('');
}

function grams(text) {
  const padded = ` ${text} `;
  const set = new Set();
  for (let index = 0; index < padded.length - 2; index++) set.add(padded.slice(index, index + 3));
  return set;
}

function dice(left, right) {
  let shared = 0;
  for (const part of left) if (right.has(part)) shared++;
  return left.size + right.size ? (2 * shared) / (left.size + right.size) : 0;
}

export function findMatches(quiz, query, limit = 5) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || !Array.isArray(quiz?.questions)) return [];
  const candidates = quiz.questions.map((question, index) => ({ question, index, normalized: normalizeText(question.question) }));
  const exact = candidates.filter(candidate => candidate.normalized === normalizedQuery);
  const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Math.floor(Number(limit)))) : 5;
  if (exact.length) return exact.slice(0, cap).map(({ question }) => ({ question, score: 1, exact: true, ambiguous: exact.length > 1 }));

  const tokens = new Set(normalizedQuery.split(' '));
  // Very short fragments match too many unrelated questions. Keep those exact-only.
  if (tokens.size < 3 || normalizedQuery.length < 12) return [];
  const queryGrams = grams(normalizedQuery);
  const queryOperators = operatorSignature(normalizedQuery);
  const matches = candidates.map(candidate => {
    // An otherwise similar equation with a different operator or grouping is not a match.
    if (operatorSignature(candidate.normalized) !== queryOperators) {
      return { question: candidate.question, index: candidate.index, score: 0, exact: false, ambiguous: false };
    }
    const words = new Set(candidate.normalized.split(' '));
    let overlap = 0;
    for (const word of tokens) if (words.has(word)) overlap++;
    const score = overlap < 2 ? 0 : .75 * dice(tokens, words) + .25 * dice(queryGrams, grams(candidate.normalized));
    return { question: candidate.question, index: candidate.index, score, exact: false, ambiguous: false };
  }).filter(candidate => candidate.score >= .75).sort((a, b) => b.score - a.score || a.index - b.index);
  const ambiguous = matches.length > 1 && matches[0].score - matches[1].score < .04;
  return matches.slice(0, cap).map(({ index, ...result }) => ({ ...result, ambiguous: ambiguous && matches[0].score - result.score < .04 }));
}
