import { parseQuizLink } from './quiz-links.js';
import { cleanObservation } from './observations.js';
import { fetchSharedQuiz, searchPublicQuiz } from './public-api.js';
import { getSession, saveSession } from './session-context.js';
import { listCorrections, lookupCorrection, deleteCorrection, clearCorrections } from './correction-memory.js';

export function isToolsSender(sender) {
  return sender?.id === chrome.runtime.id && typeof sender.url === 'string' &&
    sender.url.split(/[?#]/)[0] === chrome.runtime.getURL('tools.html');
}

async function playerTab(id) {
  if (!Number.isInteger(id) || id < 0) throw new Error('Sélectionne un onglet joueur Kahoot.');
  const tab = await chrome.tabs.get(id);
  const url = new URL(tab.url || '');
  if (url.protocol !== 'https:' || !['kahoot.it', 'play.kahoot.it'].includes(url.hostname)) throw new Error('Cet onglet n’est pas une page joueur Kahoot.');
  return tab;
}

export async function runToolAction(message, sender) {
  if (!isToolsSender(sender)) return { ok: false, error: 'Action réservée à la page Outils de l’extension.' };
  try {
    if (message.action === 'link') {
      const link = parseQuizLink(message.input);
      if (link.kind !== 'quiz') return { ok: true, kind: link.kind, message: link.kind === 'live'
        ? 'Ce lien rejoint une partie. Il ne contient pas l’identifiant du quiz.'
        : 'Ce lien est un devoir. Rejoins-le normalement ; son identifiant ne désigne pas directement un quiz.' };
      return { ok: true, kind: 'quiz', quiz: await fetchSharedQuiz(link.id), source: 'shared-link' };
    }
    if (message.action === 'select') {
      const tab = await playerTab(message.tabId);
      const quiz = message.id ? await fetchSharedQuiz(parseQuizLink(message.id).id) : null;
      const session = await getSession(tab.id);
      session.selectedId = quiz?.id || null;
      session.history = [];
      await saveSession(tab.id, session);
      return { ok: true };
    }
    if (message.action === 'search') {
      const observed = cleanObservation(message.observed);
      if (!observed) throw new Error('Saisis une question et 2 à 20 propositions distinctes, une par ligne.');
      let memory;
      try { memory = await lookupCorrection(observed); } catch { /* Public search can continue without local memory. */ }
      if (memory) return { ok: true, quiz: memory, source: 'local-memory' };
      return { ok: true, quiz: await searchPublicQuiz(observed), source: 'public-search' };
    }
    if (message.action === 'memory-list') return { ok: true, records: await listCorrections() };
    if (message.action === 'memory-delete') {
      if (typeof message.key !== 'string' || message.key.length > 15000) throw new Error('Correction invalide.');
      await deleteCorrection(message.key);
      return { ok: true };
    }
    if (message.action === 'memory-clear') { await clearCorrections(); return { ok: true }; }
    if (message.action === 'diagnostic') {
      const tab = await playerTab(message.tabId);
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['probe-runtime.js'] });
      const probe = result[0]?.result || {};
      const session = await getSession(tab.id);
      return { ok: true, diagnostic: {
        quizId: typeof probe.quizId === 'string' && /^[0-9a-f-]{36}$/i.test(probe.quizId) ? probe.quizId : null,
        questionReceived: Boolean(cleanObservation(probe.observedQuestion)), correctionRevealed: Boolean(probe.revealedAnswer),
        questionsCompared: session.history.length, selectedQuiz: session.selectedId || null,
        source: ['public-url', 'json-script', 'game-session', 'react-store', 'received-network', 'ambiguous', 'none'].includes(probe.source) ? probe.source : 'none'
      } };
    }
    throw new Error('Action inconnue.');
  } catch (error) { return { ok: false, error: error.message || 'Action indisponible.' }; }
}
