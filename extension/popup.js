import { normalizeText, findMatches } from './matching.js';
import { decodeConnection, validateConnection } from './connection.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const STORAGE_KEY = 'ezkConnection';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
let connection = null;
let connected = false;
let quiz = null;
let capture = null;
let busy = false;
let quizSource = 'waiting';

function updateQuizSummary() {
  $('#quiz-origin').textContent = quiz ? quizSource === 'detected' ? 'QUIZ DÉTECTÉ' : 'QUIZ PRÉPARÉ' : 'DÉTECTION AUTOMATIQUE';
  $('#quiz-title').textContent = quiz?.title || 'Quiz pas encore reçu';
  $('#quiz-meta').textContent = !connected ? 'Recherche publique sans serveur local.' : quiz
    ? `${quiz.questions.length} questions · prêt à lancer`
    : 'Il sera recherché depuis la partie.';
}

function status(message, type = '') {
  $('#capture-status').textContent = message;
  $('#capture-status').className = `capture-status ${type}`;
}

function connectionStatus(message, active = false) {
  connected = active;
  $('#connection-status').textContent = message;
  $('#status-dot').classList.toggle('connected', active);
  document.body.setAttribute('data-connected', String(active));
  $('#quick-connect').hidden = active;
  $('#connected-actions').hidden = !active;
  $('#local-address').textContent = connection?.baseUrl || DEFAULT_BASE_URL;
  if (active) $('#settings-details').open = false;
  updateQuizSummary();
  updateButtons();
}

function updateButtons() {
  $('#read-tab').disabled = busy || !connected;
  $('#open-live').disabled = busy;
  $('#reread').disabled = busy || !connected;
  $('#manual-submit').disabled = busy || !connected;
  $('#manual-question').disabled = busy || !connected;
  $('#quick-pair').disabled = busy;
  $('#connect-form button').disabled = busy;
  $('#open-panel').disabled = busy;
  $('#forget').disabled = busy;
  $('#auto-start').disabled = busy;
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
    const error = new Error(data.error || 'La lecture du quiz a échoué.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadQuiz(input = '') {
  const data = await bridge(`/bridge/quiz${input ? `?input=${encodeURIComponent(input)}` : ''}`);
  const result = data.quiz || data;
  if (!Array.isArray(result.questions)) throw new Error('Le serveur n’a pas renvoyé un quiz utilisable.');
  quiz = result;
  quizSource = input ? 'detected' : 'prepared';
  updateQuizSummary();
  return result;
}

function showQuizReady() {
  updateQuizSummary();
  if (!quiz) {
    $('#results-section').innerHTML = '<p class="empty-result">Le quiz sera recherché depuis la partie.</p>';
    return;
  }
  const questionCount = quiz?.questions?.length || 0;
  $('#results-section').innerHTML = `<p class="quiz-label">${esc(quiz?.title || 'Quiz chargé')} · ${questionCount} questions</p><p class="empty-result">Lis l’onglet ou colle une question.</p>`;
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
    return `<article class="result-card"><div class="result-header"><span>Question ${esc(match.question.index || '')}</span><span class="match-tag${match.exact ? '' : ' approximate'}">${match.exact ? 'Texte identique' : `Ressemblance ${Math.round(match.score * 100)} %`}</span></div><h2>${esc(match.question.question)}</h2>
      ${answers.length ? `<ul class="answers">${answers.map(answer => `<li><span class="answer-check" aria-hidden="true">✓</span><span class="answer-body"><span class="answer-text">${esc(answer.text)}</span>${matchMapping(answer.text)}${answer.image ? '<span class="visible-choice">Réponse illustrée : consulte le panel pour voir l’image.</span>' : ''}</span><button type="button" class="copy-answer" data-copy="${esc(answer.text)}" aria-label="Copier la réponse ${esc(answer.text)}">Copier</button></li>`).join('')}</ul>` : '<p class="unknown">Le quiz ne fournit pas de correction connue pour cette question.</p>'}
      ${match.ambiguous ? '<p class="result-note"><strong>Plusieurs questions se ressemblent.</strong> Compare leurs formulations avant de choisir.</p>' : ''}
      ${!match.exact ? '<p class="result-note">Correspondance approximative : vérifie la question et les propositions.</p>' : ''}
      ${answers.length && !known ? '<p class="result-note">Certains choix du quiz n’ont pas de correction renseignée.</p>' : ''}
      ${answers.length > 1 ? '<p class="result-note">Plusieurs réponses sont déclarées correctes dans le quiz source.</p>' : ''}</article>`;
  }).join('');
}

async function readActiveTab() {
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
  return tab;
}

async function readTab() {
  status('Lecture du texte affiché…');
  await readActiveTab();
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

async function openLivePanel() {
  status('Ouverture du panneau sur ton onglet…');
  const tab = await readActiveTab();
  const probed = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: 'MAIN', files: ['probe-runtime.js']
  });
  const probeId = probed[0]?.result?.quizId;
  const detectedId = typeof probeId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(probeId)
    ? probeId.toLowerCase() : capture.quizId || '';
  if (connected) {
    try { await loadQuiz(detectedId); }
    catch (error) {
      if (error.status !== 404) throw error;
      quiz = null;
    }
  } else quiz = null;
  const questionCount = probed[0]?.result?.questionCount;
  const total = quiz?.questions?.length + (Number(quiz?.slideCount) || 0) + (Number(quiz?.skippedCount) || 0);
  if (questionCount && quiz && total !== questionCount) quiz = null;
  try {
    // Packaged code executes in Chrome's isolated world, without eval or remote code.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['live-runtime.js'] });
    const execution = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (preparedQuiz, options) => {
        if (typeof globalThis.__ezKahootStart !== 'function') throw new Error('Panneau indisponible.');
        globalThis.__ezKahootStart(preparedQuiz, options);
        return { ok: true };
      },
      args: [quiz, { publicOnly: !connected }]
    });
    if (execution[0]?.result?.ok !== true) throw new Error('Démarrage non confirmé.');
  } catch {
    throw new Error('Le panneau ne s’est pas ouvert. Recharge l’extension à jour puis réessaie sur ton onglet Kahoot.');
  }
  showQuizReady();
  status(quiz ? 'Panneau lancé. Le clic automatique se règle sur la page.' :
    'Panneau lancé. Détection automatique du quiz en cours.', 'success');
}

async function connectCandidate(candidate) {
  const previous = { connection, connected, quiz, quizSource };
  connection = candidate;
  try {
    const health = await bridge('/bridge/health');
    if (health.name && health.name !== 'Ez-Kahoot') throw new Error('Ce serveur n’est pas un espace Ez-Kahoot.');
    try { await loadQuiz(); }
    catch (error) { if (error.status !== 404) throw error; quiz = null; }
    await chrome.storage.local.set({ [STORAGE_KEY]: candidate });
    connectionStatus('Connecté à Ez-Kahoot', true);
    $('#connection-code').value = '';
    showQuizReady();
    status('Ouvre ton onglet Kahoot, puis lance le panneau.', 'success');
  } catch (error) {
    connection = previous.connection;
    quiz = previous.quiz;
    quizSource = previous.quizSource;
    connectionStatus(previous.connected ? 'Connecté à Ez-Kahoot' : 'À connecter', previous.connected);
    showQuizReady();
    throw error;
  }
}

async function quickPair() {
  status('Connexion à Ez-Kahoot…');
  let config;
  try {
    const response = await fetch(`${DEFAULT_BASE_URL}/api/companion/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('Pairing indisponible');
    config = await response.json();
    if (typeof config?.connectionCode !== 'string') throw new Error('Code absent');
    await connectCandidate(decodeConnection(config.connectionCode));
  } catch {
    $('#settings-details').open = true;
    throw new Error('Lance Ez-Kahoot puis réessaie. Tu peux aussi utiliser le code dans « Quiz importé et connexion locale ».');
  }
}

$('#quick-pair').addEventListener('click', () => task(quickPair));
$('#auto-start').addEventListener('change', () => task(async () => {
  const enabled = $('#auto-start').checked;
  try {
    await chrome.storage.local.set({ ezkAutoStart: enabled });
    status(enabled ? 'Démarrage automatique activé sur tes pages Kahoot.' : 'Démarrage automatique désactivé. Tu peux lancer le panneau ici.', 'success');
  } catch {
    $('#auto-start').checked = !enabled;
    throw new Error('Le réglage n’a pas pu être enregistré. Réessaie.');
  }
}));
$('#connect-form').addEventListener('submit', event => {
  event.preventDefault();
  task(() => connectCandidate(decodeConnection($('#connection-code').value)));
});

$('#read-tab').addEventListener('click', () => task(readTab));
$('#open-live').addEventListener('click', () => task(openLivePanel));
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
  chrome.tabs.create({ url: `${connection?.baseUrl || DEFAULT_BASE_URL}/#companion` });
});
$('#forget').addEventListener('click', () => task(async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  connection = null;
  quiz = null;
  capture = null;
  quizSource = 'waiting';
  connectionStatus('Mode autonome', false);
  showQuizReady();
  status('Connexion supprimée sur ce navigateur.');
  $('#quick-pair').focus();
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
  const preferences = await chrome.storage.local.get('ezkAutoStart');
  $('#auto-start').checked = preferences.ezkAutoStart !== false;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) { connectionStatus('Mode autonome', false); return; }
    connection = validateConnection(stored[STORAGE_KEY]);
    await bridge('/bridge/health');
    connectionStatus('Connecté à Ez-Kahoot', true);
    try { await loadQuiz(); showQuizReady(); }
    catch (error) {
      if (error.status !== 404) throw error;
      quiz = null;
      showQuizReady();
    }
  } catch (error) {
    connectionStatus('Mode autonome · panel local déconnecté', false);
    status('Le panneau automatique reste disponible. Pour un quiz importé, reconnecte le panel local.');
  }
});

$('#open-tools').addEventListener('click', () => task(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.create({ url: chrome.runtime.getURL('tools.html') + (Number.isInteger(tab?.id) ? '?tab=' + tab.id : '') });
}));
