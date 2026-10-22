import { normalizeText, findMatches } from './matching.js';
import { decodeConnection, validateConnection } from './connection.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const STORAGE_KEY = 'ezkConnection';
let connection = null;
let connected = false;
let quiz = null;
let capture = null;
let busy = false;

function status(message, type = '') {
  $('#capture-status').textContent = message;
  $('#capture-status').className = `capture-status ${type}`;
}

function connectionStatus(message, active = false) {
  connected = active;
  $('#connection-status').textContent = message;
  $('#status-dot').classList.toggle('connected', active);
  $('#connect-form').hidden = active;
  $('#connected-actions').hidden = !active;
  $('#local-address').textContent = active ? connection.baseUrl : '';
  updateButtons();
}

function updateButtons() {
  $('#read-tab').disabled = busy || !connected;
  $('#reread').disabled = busy || !connected;
  $('#manual-submit').disabled = busy || !connected;
  $('#connect-form button').disabled = busy;
  $('#open-panel').disabled = busy || !connected;
  $('#forget').disabled = busy;
  document.body.setAttribute('aria-busy', String(busy));
}

async function task(callback) {
  if (busy) return;
  busy = true;
  updateButtons();
  try { await callback(); }
  catch (error) { status(error.message || 'L’opération n’a pas pu aboutir.', 'error'); }
  finally { busy = false; updateButtons(); }
}

async function bridge(path) {
  if (!connection) throw new Error('Connecte d’abord ton espace Ez-Kahoot.');
  let response;
  try {
    response = await fetch(`${connection.baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('Le serveur local met trop de temps à répondre. Vérifie Ez-Kahoot.');
    throw new Error('Serveur local inaccessible. Lance Ez-Kahoot, puis réessaie.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('Le serveur ne répond pas au format Ez-Kahoot attendu.'); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      connectionStatus('Code expiré ou refusé. Recopie le code depuis le panel.', false);
    }
    throw new Error(data.error || 'La lecture du quiz a échoué.');
  }
  return data;
}

async function loadQuiz(input = '') {
  const data = await bridge(`/bridge/quiz${input ? `?input=${encodeURIComponent(input)}` : ''}`);
  const result = data.quiz || data;
  if (!Array.isArray(result.questions)) throw new Error('Le serveur n’a pas renvoyé un quiz utilisable.');
  quiz = result;
  return result;
}

function showQuizReady() {
  const questionCount = quiz?.questions?.length || 0;
  $('#results-section').innerHTML = `<p class="quiz-label">${esc(quiz?.title || 'Quiz chargé')} · ${questionCount} questions</p><div class="empty-result"><span aria-hidden="true">?</span><p>Lis l’onglet Kahoot ou colle une question pour retrouver sa réponse.</p></div>`;
}

function matchMapping(answer) {
  if (!capture?.choices?.length) return '';
  const normalized = normalizeText(answer);
  if (!normalized) return '';
  const same = capture.choices.filter(choice => normalizeText(choice.text) === normalized);
  return same.length === 1 ? '<span class="visible-choice">Texte retrouvé dans les propositions visibles</span>' : '';
}

function showResults(query) {
  if (!quiz) throw new Error('Charge un quiz depuis ton panel Ez-Kahoot avant de chercher.');
  const matches = findMatches(quiz, query);
  const prefix = `<p class="quiz-label">${esc(quiz.title)} · ${quiz.questions.length} questions</p><p class="query-preview">${esc(query)}</p>`;
  if (!matches.length) {
    $('#results-section').innerHTML = `${prefix}<div class="error-box"><strong>Aucune correspondance fiable.</strong><p>Vérifie le quiz chargé et colle le texte complet de la question. Aucun corrigé n’est déduit d’une simple couleur ou d’un numéro.</p></div>`;
    return;
  }
  $('#results-section').innerHTML = prefix + matches.map(match => {
    const answers = Array.isArray(match.question.choices) ? match.question.choices.filter(choice => choice.correct === true) : [];
    const known = Array.isArray(match.question.choices) && match.question.choices.every(choice => typeof choice.correct === 'boolean');
    return `<article class="result-card"><div class="result-header"><span>Question ${esc(match.question.index || '')}</span><span class="match-tag${match.exact ? '' : ' approximate'}">${match.exact ? 'Texte identique' : `Ressemblance ${Math.round(match.score * 100)} %`}</span></div><h3>${esc(match.question.question)}</h3>
      ${answers.length ? `<ul class="answers">${answers.map(answer => `<li><span class="answer-check" aria-hidden="true">✓</span><span class="answer-body"><span class="answer-text">${esc(answer.text)}</span>${matchMapping(answer.text)}${answer.image ? '<span class="visible-choice">Réponse illustrée : consulte le panel pour voir l’image.</span>' : ''}</span><button type="button" class="copy-answer" data-copy="${esc(answer.text)}" aria-label="Copier la réponse ${esc(answer.text)}">Copier</button></li>`).join('')}</ul>` : '<p class="unknown">Le quiz ne fournit pas de correction connue pour cette question.</p>'}
      ${match.ambiguous ? '<p class="result-note"><strong>Plusieurs questions se ressemblent.</strong> Compare leurs formulations avant de choisir.</p>' : ''}
      ${!match.exact ? '<p class="result-note">Correspondance approximative : vérifie la question et les propositions.</p>' : ''}
      ${answers.length && !known ? '<p class="result-note">Certains choix du quiz n’ont pas de correction renseignée.</p>' : ''}
      ${answers.length > 1 ? '<p class="result-note">Plusieurs réponses sont déclarées correctes dans le quiz source.</p>' : ''}</article>`;
  }).join('');
}

async function readTab() {
  status('Lecture du texte affiché…');
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  let url;
  try { url = new URL(tab?.url || ''); } catch { /* Show the same useful instruction for restricted tabs. */ }
  if (!tab?.id || !url || url.protocol !== 'https:' || !['kahoot.it', 'create.kahoot.it', 'play.kahoot.it'].includes(url.hostname)) {
    throw new Error('Ouvre un onglet Kahoot, puis clique sur le compagnon. Tu peux aussi saisir la question ci-dessous.');
  }
  let execution;
  try { execution = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['reader.js'] }); }
  catch { throw new Error('Lecture refusée par le navigateur. Recharge l’onglet Kahoot puis ouvre à nouveau le compagnon.'); }
  capture = execution[0]?.result;
  if (!capture || typeof capture !== 'object') throw new Error('Le texte de cet onglet n’a pas pu être lu.');
  await loadQuiz(capture.quizId || '');
  if (!capture.question) {
    showQuizReady();
    $('#manual-details').open = true;
    status('Aucune question lisible dans l’onglet. Si seules des formes apparaissent, saisis le texte affiché par l’hôte.', 'error');
    $('#manual-question').focus();
    return;
  }
  $('#manual-question').value = capture.question;
  showResults(capture.question);
  status(capture.method === 'heading' ? 'Titre visible lu : vérifie qu’il s’agit bien de la question.' : 'Question visible lue. Comparaison avec ton corrigé local terminée.', 'success');
}

$('#connect-form').addEventListener('submit', event => {
  event.preventDefault();
  task(async () => {
    const candidate = decodeConnection($('#connection-code').value);
    const previous = connection;
    connection = candidate;
    try {
      const health = await bridge('/bridge/health');
      if (health.name && health.name !== 'Ez-Kahoot') throw new Error('Ce serveur n’est pas un espace Ez-Kahoot.');
      await chrome.storage.local.set({ [STORAGE_KEY]: candidate });
      connectionStatus('Ton espace local est connecté.', true);
      $('#connection-code').value = '';
      try { await loadQuiz(); showQuizReady(); status('Prêt à lire une question.', 'success'); }
      catch (error) { status(error.message, 'error'); }
    } catch (error) { connection = previous; throw error; }
  });
});

$('#read-tab').addEventListener('click', () => task(readTab));
$('#reread').addEventListener('click', () => task(readTab));
$('#manual-form').addEventListener('submit', event => {
  event.preventDefault();
  task(async () => {
    const query = $('#manual-question').value.trim();
    if (!query) return $('#manual-question').focus();
    if (!quiz) await loadQuiz();
    capture = null;
    showResults(query);
    status('Recherche terminée dans le quiz chargé.', 'success');
  });
});
$('#open-panel').addEventListener('click', () => {
  if (connection) chrome.tabs.create({ url: `${connection.baseUrl}/#companion` });
});
$('#forget').addEventListener('click', () => task(async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  connection = null;
  quiz = null;
  capture = null;
  connectionStatus('Connexion oubliée sur ce navigateur. Tu peux coller un nouveau code.', false);
  $('#results-section').innerHTML = '<div class="empty-result"><span aria-hidden="true">?</span><p>Reconnecte ton espace pour lire un corrigé.</p></div>';
  status('Connexion locale supprimée.');
  $('#connection-code').focus();
}));
$('#results-section').addEventListener('click', async event => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = 'Copié';
    setTimeout(() => { if (button.isConnected) button.textContent = 'Copier'; }, 1500);
  } catch { status('Copie indisponible. Sélectionne le texte de la réponse pour le copier.', 'error'); }
});

task(async () => {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) return;
    connection = validateConnection(stored[STORAGE_KEY]);
    await bridge('/bridge/health');
    connectionStatus('Ton espace local est connecté.', true);
    try { await loadQuiz(); showQuizReady(); }
    catch (error) { status(error.message, 'error'); }
  } catch (error) {
    connectionStatus('Reconnecte ton espace avec un code à jour.', false);
    status(error.message, 'error');
  }
});
