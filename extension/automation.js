import { findMatches, normalizeText } from './matching.js';

const unsupportedText = /^(?:r[eé]ponse (?:en image|sans texte)|question (?:en image|sans titre))$/i;
const supportedTypes = new Set(['quiz', 'true_false', 'multiple_choice']);

function result(status, message, details = {}) {
  return { status, message, answers: [], targetIndexes: [], ...details };
}

/** Decide from a snapshot only. The caller must revalidate it before clicking. */
export function decideAnswer(quiz, capture) {
  const query = typeof capture?.question === 'string' ? capture.question.trim() : '';
  if (!query) {
    return result('waiting', 'En attente de la prochaine question.');
  }
  if (!Array.isArray(quiz?.questions) || !quiz.questions.length) {
    return result('unknown', 'Charge le corrigé de ce quiz dans Ez-Kahoot.');
  }
  // Filter malformed records without altering the imported quiz.
  const candidates = { questions: quiz.questions.filter(question => question && typeof question.question === 'string') };
  const matches = findMatches(candidates, query, 20).filter(match => match.exact);
  if (!matches.length) return result('unknown', 'Aucune question exacte dans le corrigé chargé.');
  if (matches.length !== 1 || matches[0].ambiguous) {
    return result('ambiguous', 'Plusieurs questions identiques dans le corrigé.');
  }

  const question = matches[0].question;
  const choices = question.choices;
  const details = { question };
  if (question.type && !supportedTypes.has(question.type)) {
    return result('unsupported', 'Ce format de question ne permet pas le clic automatique.', details);
  }
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 20 || choices.some(choice => !choice || typeof choice !== 'object')) {
    return result('unsupported', 'Les propositions du corrigé sont incomplètes.', details);
  }
  const answers = choices.filter(choice => choice.correct === true);
  details.answers = answers;
  if (choices.some(choice => typeof choice.correct !== 'boolean') || !answers.length) {
    return result('unknown', 'Le corrigé ne renseigne pas toutes les réponses.', details);
  }
  if (capture.canAnswer === false) {
    return result('waiting', 'Réponse trouvée ; en attente des boutons actifs.', details);
  }
  if (answers.length !== 1 || question.multiSelect === true) {
    return result('unsupported', 'Plusieurs réponses : sélection manuelle nécessaire.', details);
  }
  if (unsupportedText.test(question.question.trim()) || choices.some(choice => typeof choice.text !== 'string' || unsupportedText.test(choice.text.trim()))) {
    return result('unsupported', 'Le texte des images ou des propositions est insuffisant.', details);
  }

  const visible = capture.choices;
  if (!Array.isArray(visible) || !visible.length) {
    return result('unmapped', 'Réponse trouvée ; les boutons ne montrent pas leur texte.', details);
  }
  if (visible.length !== choices.length || visible.some(choice => !choice || typeof choice.text !== 'string' || !Number.isInteger(choice.index) || choice.index < 0 || choice.index > 19)) {
    return result('unmapped', 'Les boutons visibles ne correspondent pas au corrigé.', details);
  }
  const sourceTexts = choices.map(choice => normalizeText(choice.text));
  const visibleTexts = visible.map(choice => normalizeText(choice.text));
  if (sourceTexts.some(text => !text) || visibleTexts.some(text => !text) || new Set(sourceTexts).size !== sourceTexts.length || new Set(visibleTexts).size !== visibleTexts.length || new Set(visible.map(choice => choice.index)).size !== visible.length) {
    return result('ambiguous', 'Propositions identiques ou non identifiables : clic suspendu.', details);
  }
  const visibleByText = new Map(visibleTexts.map((text, index) => [text, visible[index]]));
  if (sourceTexts.some(text => !visibleByText.has(text))) {
    return result('unmapped', 'Les propositions affichées diffèrent du corrigé.', details);
  }
  const target = visibleByText.get(normalizeText(answers[0].text));
  if (target.disabled === true || target.enabled === false) {
    return result('waiting', 'Le bouton de réponse n’est pas encore actif.', details);
  }
  // Keep a question stable across DOM reorderings. Never use color or source order.
  const signature = JSON.stringify([
    typeof quiz.id === 'string' ? quiz.id : '',
    typeof question.id === 'string' ? question.id : '',
    typeof capture.roundId === 'string' ? capture.roundId.trim().replace(/\s+/g, ' ') : Number.isFinite(capture.roundId) ? String(capture.roundId) : '',
    normalizeText(question.question),
    [...visibleTexts].sort()
  ]);
  return result('ready', 'Réponse exacte et bouton identifié.', {
    ...details, targetIndexes: [target.index], signature
  });
}
