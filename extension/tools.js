import { normalizeText } from './matching.js';
import { observationKey } from './observations.js';
import { matchingQuestion } from './public-api.js';
import { imageFromFile, captureScreen, recognizeImage } from './ocr.js';

const $ = selector => document.querySelector(selector);
const node = (tag, text) => { const value = document.createElement(tag); value.textContent = text; return value; };
let linkedQuiz = null, image = null, ocrAbort = null, records = [], pending = false;
function status(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
async function action(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'EZK_TOOLS', action, ...payload });
  if (!response?.ok) throw new Error(response?.error || 'Le compagnon ne répond pas. Recharge l’extension.');
  return response;
}
async function task(button, operation) {
  if (pending) return;
  pending = true; button.disabled = true;
  try { await operation(); }
  catch (error) { status(error.message || 'Opération indisponible.', true); }
  finally { pending = false; button.disabled = button.id === 'use-quiz' && !linkedQuiz; }
}
function tabId() {
  if (!$('#player-tab').value) throw new Error('Ouvre ta partie Kahoot puis actualise la liste des onglets.');
  return Number($('#player-tab').value);
}
async function refreshTabs() {
  const previous = $('#player-tab').value || new URLSearchParams(location.search).get('tab');
  const tabs = await chrome.tabs.query({ url: ['https://kahoot.it/*', 'https://play.kahoot.it/*'] });
  const select = $('#player-tab'); select.replaceChildren();
  const empty = node('option', tabs.length ? 'Choisir un onglet' : 'Aucun onglet Kahoot ouvert'); empty.value = ''; select.append(empty);
  for (const tab of tabs) { const option = node('option', `${tab.title || 'Kahoot'} · ${tab.id}`); option.value = String(tab.id); select.append(option); }
  if (tabs.some(tab => String(tab.id) === previous)) select.value = previous;
  else if (tabs.length === 1) select.value = String(tabs[0].id);
}
function renderQuiz(container, quiz, observed = null, source = '') {
  container.hidden = false; container.replaceChildren(node('strong', quiz.title));
  container.append(node('p', source === 'local-memory' ? 'Source : correction mémorisée après résultat.' : source === 'shared-link'
    ? `${quiz.questions.length} question${quiz.questions.length > 1 ? 's' : ''} · source : lien fourni.` : `${quiz.questions.length} question${quiz.questions.length > 1 ? 's' : ''} · candidat public vérifié.`));
  const question = observed ? matchingQuestion(quiz, observed, null) : null;
  if (question) {
    const answers = question.choices.filter(choice => choice.correct === true);
    if (!question.choices.every(choice => typeof choice.correct === 'boolean') || !answers.length) container.append(node('p', 'Correction complète indisponible.'));
    else { const list = document.createElement('ul'); answers.forEach(answer => list.append(node('li', answer.text))); container.append(list); }
  }
}
$('#link-form').addEventListener('submit', event => {
  event.preventDefault();
  task(event.submitter || $('#link-form button'), async () => {
    linkedQuiz = null; $('#use-quiz').disabled = true; $('#link-result').hidden = true;
    status('Lecture du lien…');
    const response = await action('link', { input: $('#quiz-link').value });
    if (!response.quiz) { status(response.message); return; }
    linkedQuiz = response.quiz; renderQuiz($('#link-result'), linkedQuiz, null, response.source);
    $('#use-quiz').disabled = false; status('Quiz chargé. Tu peux le relier à l’onglet choisi.');
  });
});
$('#use-quiz').addEventListener('click', event => task(event.currentTarget, async () => {
  if (!linkedQuiz) return;
  await action('select', { tabId: tabId(), id: linkedQuiz.id });
  status('Lien associé. Le panneau l’utilisera dès qu’une question correspondra.');
}));
$('#clear-link').addEventListener('click', event => task(event.currentTarget, async () => {
  await action('select', { tabId: tabId(), id: null }); status('Lien retiré de cet onglet. La recherche automatique continue.');
}));
$('#refresh-tabs').addEventListener('click', event => task(event.currentTarget, refreshTabs));

function setImage(value) {
  ocrAbort?.abort(); image = value;
  $('#preview').hidden = !value;
  if (value) $('#preview').src = value; else $('#preview').removeAttribute('src');
  $('#read-image').disabled = !value; $('#clear-image').disabled = !value;
  $('#ocr-progress').hidden = true;
  $('#ocr-status').textContent = value ? 'Image prête. Clique sur « Lire le texte ».' : 'Image effacée.';
}
$('#image-file').addEventListener('change', event => task(event.currentTarget, async () => {
  const file = event.target.files[0]; if (file) setImage(await imageFromFile(file));
}));
$('#capture-screen').addEventListener('click', event => task(event.currentTarget, async () => {
  try { setImage(await captureScreen()); }
  catch (error) { if (['NotAllowedError', 'AbortError'].includes(error.name)) { status('Capture annulée.'); return; } throw error; }
}));
$('#clear-image').addEventListener('click', () => { setImage(null); $('#image-file').value = ''; });
$('#read-image').addEventListener('click', async () => {
  if (!image || ocrAbort) return;
  const controller = new AbortController(); ocrAbort = controller;
  $('#read-image').disabled = true; $('#cancel-ocr').hidden = false; $('#ocr-progress').hidden = false;
  $('#ocr-status').textContent = 'Préparation du moteur local…';
  try {
    const text = await recognizeImage(image, { signal: controller.signal, onProgress: info => {
      const percent = Math.round(Math.min(1, Math.max(0, Number(info.progress) || 0)) * 100);
      $('#ocr-progress').value = percent;
      $('#ocr-status').textContent = info.status === 'recognizing text' ? `Lecture du texte : ${percent} %` : 'Préparation du moteur local…';
    } });
    $('#ocr-text').value = text;
    $('#ocr-status').textContent = text.trim() ? 'Texte lu. Vérifie la question et toutes les propositions.' : 'Aucun texte lisible. Essaie une capture plus nette.';
  } catch (error) { $('#ocr-status').textContent = error.message; }
  finally { if (ocrAbort === controller) ocrAbort = null; $('#read-image').disabled = !image; $('#cancel-ocr').hidden = true; $('#ocr-progress').hidden = true; }
});
$('#cancel-ocr').addEventListener('click', () => ocrAbort?.abort());
window.addEventListener('pagehide', () => ocrAbort?.abort());
$('#split-text').addEventListener('click', () => {
  const lines = $('#ocr-text').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  $('#question').value = (lines.shift() || '').slice(0, 1200); $('#choices').value = lines.join('\n').slice(0, 8000);
  status('Vérifie la séparation des lignes et retire les textes qui ne sont pas des propositions.'); $('#question').focus();
});
$('#search-form').addEventListener('submit', event => {
  event.preventDefault(); task(event.submitter || $('#search-form button'), async () => {
    const observed = { question: $('#question').value.trim(), choices: $('#choices').value.split(/\r?\n/).map(v => v.trim()).filter(Boolean) };
    $('#search-result').hidden = true; status('Recherche dans la mémoire et les quiz publics…');
    const response = await action('search', { observed });
    renderQuiz($('#search-result'), response.quiz, observed, response.source); status('Corrigé retrouvé avec la question et ses propositions.');
  });
});

async function refreshMemory() {
  records = (await action('memory-list')).records;
  $('#memory-count').textContent = `${records.length} / 100 corrections conservées · limite de 1 Mo`;
  const list = $('#memory-list'); list.replaceChildren();
  if (!records.length) list.append(node('p', 'Aucune correction mémorisée pour le moment. Elles sont ajoutées après les résultats reçus en partie.'));
  for (const record of records) {
    const item = document.createElement('article'); item.className = 'memory-item';
    item.append(node('h3', record.question));
    const conflict = record.conflict || record.variants.length > 1;
    item.append(node('p', conflict ? 'Corrections contradictoires : réutilisation bloquée.' : 'Réponse : ' + record.choices.filter(text => record.variants[0].includes(normalizeText(text))).join(' · ')));
    item.append(node('p', 'Révélée le ' + new Date(record.updatedAt).toLocaleString('fr-FR')));
    const button = node('button', 'Supprimer'); button.className = 'secondary'; button.type = 'button';
    button.setAttribute('aria-label', `Supprimer la correction : ${record.question}`);
    button.addEventListener('click', () => task(button, async () => { await action('memory-delete', { key: observationKey(record) }); await refreshMemory(); status('Correction supprimée.'); }));
    item.append(button); list.append(item);
  }
}
$('#refresh-memory').addEventListener('click', event => task(event.currentTarget, refreshMemory));
$('#clear-memory').addEventListener('click', () => { $('#clear-confirm').hidden = false; $('#confirm-clear').focus(); });
$('#cancel-clear').addEventListener('click', () => { $('#clear-confirm').hidden = true; $('#clear-memory').focus(); });
$('#confirm-clear').addEventListener('click', event => task(event.currentTarget, async () => {
  await action('memory-clear'); await refreshMemory(); $('#clear-confirm').hidden = true; $('#clear-memory').focus(); status('Mémoire effacée.');
}));
$('#export-memory').addEventListener('click', event => task(event.currentTarget, async () => {
  await refreshMemory();
  const blob = new Blob([JSON.stringify({ format: 'Ez-Kahoot corrections', version: 1, records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'ez-kahoot-corrections.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Export des corrections préparé.');
}));
$('#run-diagnostic').addEventListener('click', event => task(event.currentTarget, async () => {
  const { diagnostic: d } = await action('diagnostic', { tabId: tabId() });
  const result = $('#diagnostic-result'); result.replaceChildren();
  const labels = { 'public-url': 'Lien public', 'json-script': 'Métadonnées JSON', 'game-session': 'Session de partie', 'react-store': 'État de la page', 'received-network': 'Données de quiz reçues', ambiguous: 'Métadonnées ambiguës', none: 'Aucune source identifiée' };
  for (const [label, value] of [['Identifiant du quiz', d.quizId || 'Non reçu'], ['Question et choix', d.questionReceived ? 'Reçus' : 'Non reçus dans les métadonnées'], ['Correction de résultat', d.correctionRevealed ? 'Reçue' : 'Non reçue'], ['Questions croisées', d.questionsCompared], ['Lien associé', d.selectedQuiz || 'Aucun'], ['Source', labels[d.source]]]) result.append(node('dt', label), node('dd', String(value)));
  status('Diagnostic terminé. Aucun journal réseau brut enregistré.');
}));

Promise.all([refreshTabs(), refreshMemory()]).catch(error => status(error.message, true));
