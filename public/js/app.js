import { icon } from './icons.js';
import { readLibrary, saveQuiz as persistQuiz, escapeHtml as esc } from './data.js';
import { renderLibrary } from './library.js';
import { exportQuiz, copyAnswers, printQuiz } from './exports.js';
import { renderTools } from './tools.js?v=1.4.1';
import { renderCompanion } from './companion.js?v=1.4.1';

const views = [
  { id: 'explorer', label: 'Explorer', icon: 'grid' },
  { id: 'companion', label: 'Compagnon', icon: 'bolt' },
  { id: 'library', label: 'Bibliothèque', icon: 'library' },
  { id: 'tools', label: 'Boîte à outils', icon: 'tools' }
];
const root = document.querySelector('#view');
let currentQuiz = null;
let currentView = 'explorer';
let cleanup;
let loading = false;
let inputValue = '';
let importError = '';
let showAll = false;
let query = '';
let revealed = new Set();
let requestSequence = 0;

const context = {
  getQuiz: () => currentQuiz,
  setQuiz: async quiz => setQuiz(quiz),
  toast,
  saveQuiz,
  navigate
};

function toast(message, type = 'success') {
  const region = document.querySelector('#toasts');
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' error' : ''}`;
  el.innerHTML = `${icon(type === 'error' ? 'info' : 'check')}<span>${esc(message)}</span>`;
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.remove(), 4500);
}

function saveQuiz(quiz = currentQuiz) {
  if (!quiz) return false;
  const success = persistQuiz(quiz);
  if (success !== false) toast('Quiz enregistré dans ta bibliothèque.');
  else toast('Impossible d’enregistrer : le stockage de ce navigateur est plein ou indisponible.', 'error');
  return success;
}

function navigate(id, focus = true) {
  if (!views.some(view => view.id === id)) id = 'explorer';
  currentView = id;
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  render();
  window.scrollTo(0, 0);
  if (focus) root.focus({ preventScroll: true });
}

function setQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.questions)) throw new Error('Ce fichier ne contient pas un quiz reconnu.');
  currentQuiz = quiz;
  showAll = false;
  query = '';
  revealed = new Set();
  importError = '';
  inputValue = quiz.id || '';
  updateSidebar();
  navigate('explorer');
}

function updateSidebar() {
  const box = document.querySelector('#sidebar-quiz');
  if (!currentQuiz) return;
  box.innerHTML = `<div class="mini-shapes" aria-hidden="true"><i></i><i></i><i></i></div><strong class="sidebar-current-title">${esc(currentQuiz.title || 'Quiz sans titre')}</strong><span class="quiz-count">${currentQuiz.questions.length} questions dans ton espace</span>`;
}

function renderNavigation() {
  document.querySelector('#navigation').innerHTML = views.map(view => `<button type="button" class="nav-item${view.id === currentView ? ' active' : ''}" data-view="${view.id}" ${view.id === currentView ? 'aria-current="page"' : ''}>${icon(view.icon)}<span>${view.label}</span></button>`).join('');
  document.querySelector('#view-name').textContent = views.find(view => view.id === currentView).label;
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
}

function render() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  renderNavigation();
  root.innerHTML = '';
  if (currentView === 'explorer') renderExplorer();
  else if (currentView === 'library') cleanup = renderLibrary(root, context);
  else if (currentView === 'tools') cleanup = renderTools(root, context);
  else if (currentView === 'companion') cleanup = renderCompanion(root, context);
  if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.gsap.fromTo(root.children, { opacity: 0, y: 9 }, { opacity: 1, y: 0, duration: .38, stagger: .035, ease: 'power2.out', clearProps: 'all' });
  }
}

function importForm(compact = false) {
  return `<form id="quiz-import" class="${compact ? 'inline-import' : 'surface import-panel'}" aria-busy="${loading}">
    ${compact ? icon('link') : `<div class="panel-tag">${icon('link')} IMPORTER UN QUIZ</div><h2>Ton point de départ.</h2><p>Colle le lien ou l’identifiant d’un quiz public.</p><label class="field-label" for="quiz-input">Lien Kahoot ou identifiant UUID</label>`}
    <div class="input-group"><input id="quiz-input" name="quiz" aria-label="Lien Kahoot ou identifiant UUID" type="text" value="${esc(inputValue)}" placeholder="${compact ? 'Charger un autre quiz public…' : 'https://create.kahoot.it/details/…'}" autocomplete="off" spellcheck="false" ${loading ? 'disabled' : ''}><button class="btn ${compact ? 'btn-secondary' : 'btn-primary'}" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Chargement…' : `Charger ${icon('arrow')}`}</button></div>
    ${compact ? '' : `<p class="input-hint">Quiz public uniquement · Pas besoin de compte ni de code PIN</p>${loading ? '<div class="loading-bar" aria-hidden="true"></div><span class="loading-caption" role="status">Récupération du quiz auprès de Kahoot…</span>' : ''}`}
    ${!compact && importError ? `<p class="import-error" role="alert">${esc(importError)}</p>` : ''}
    <div class="${compact ? '' : 'import-divider'}">${compact ? '' : `<button type="button" class="text-button" id="load-demo" ${loading ? 'disabled' : ''}>Essayer avec brainwave ${icon('up')}</button>`}<button type="button" class="file-input-button" id="import-file" ${loading ? 'disabled' : ''}>${icon('upload')} Importer un JSON</button><input type="file" id="json-file" aria-label="Importer un fichier de quiz JSON" accept=".json,application/json" class="hidden-input" tabindex="-1"></div>
  </form>${compact && importError ? `<p class="import-error inline-import-error" role="alert">${esc(importError)}</p>` : ''}`;
}

function artwork() {
  return `<aside class="art-panel" aria-label="Illustration géométrique de quiz"><div class="art-topline"><span>LE SAVOIR PREND FORME.</span><div class="art-monogram" aria-hidden="true"><span></span><span></span><span></span></div></div><svg class="art-object" viewBox="0 0 340 225" aria-hidden="true"><defs><pattern id="dotGrid" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#73845e" opacity=".3"/></pattern><filter id="shapeShadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#30461d" flood-opacity=".12"/></filter></defs><rect x="4" y="5" width="332" height="215" fill="url(#dotGrid)"/><ellipse cx="174" cy="194" rx="111" ry="13" fill="#73845e" opacity=".09"/><g filter="url(#shapeShadow)"><rect x="74" y="51" width="99" height="99" rx="15" transform="rotate(-13 124 100)" fill="#ff7954"/><path d="M184 32 248 143H120z" fill="#fcf8e8" transform="rotate(10 184 90)"/><circle cx="236" cy="140" r="52" fill="#829b63"/><rect x="111" y="131" width="63" height="63" rx="8" transform="rotate(18 143 163)" fill="#2f3d2b"/><path d="m128 161 9 11 20-24" fill="none" stroke="#e7f0d8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="239" cy="135" r="19" fill="none" stroke="#dce9ca" stroke-width="3"/><path d="M239 122v14l9 6" fill="none" stroke="#dce9ca" stroke-width="3" stroke-linecap="round"/></g><path d="M43 65h18m-9-9v18M285 63h12m-6-6v12" fill="none" stroke="#7d8e69" stroke-width="1.2"/><circle cx="70" cy="182" r="3" fill="#a5b88d"/></svg><div class="art-bottomline"><strong>Joue mieux.<br>Comprends plus.</strong>${icon('up')}</div></aside>`;
}

function renderWelcome() {
  root.innerHTML = `<section class="intro-top"><div><div class="page-kicker"><span class="kicker-line" aria-hidden="true"></span> LE MULTITOOL QUI A DE LA SUITE DANS LES IDÉES</div><h1>Le quiz.<br class="mobile-break"> Sous contrôle.</h1><p class="intro-copy">Les bonnes réponses, les bons outils, au même endroit.<br>Explore, retrouve et prépare ta prochaine partie.</p></div><span class="season-tag">TA BOÎTE À OUTILS / 01</span></section><div class="welcome-grid">${importForm()}${artwork()}</div><section class="welcome-section"><div class="section-header"><h2>Bien plus qu’un corrigé.</h2><p>TON QUIZ ET TES OUTILS, À PORTÉE DE CLIC</p></div><div class="feature-row"><button class="feature-card" data-go="companion"><div class="feature-icon">${icon('bolt')}</div>${icon('up', 'feature-arrow')}<h3>La réponse, sur ton onglet.</h3><p>Relie ton quiz au compagnon navigateur et à sa recherche rapide.</p></button><button class="feature-card" data-go="library"><div class="feature-icon">${icon('library')}</div>${icon('up', 'feature-arrow')}<h3>Tes quiz, à portée de main.</h3><p>Garde tes corrigés et retrouve-les dans ce navigateur.</p></button><button class="feature-card" data-go="tools"><div class="feature-icon">${icon('tools')}</div>${icon('up', 'feature-arrow')}<h3>Le son au bon moment.</h3><p>Quatre bruitages, un volume réglable et un bouton pour tout arrêter.</p></button></div></section><div class="hint-strip">${icon('info')}<span><strong>À portée de clic.</strong> Essaie le quiz brainwave pour découvrir le panel. Tes quiz sauvegardés restent dans ce navigateur.</span></div>`;
  bindImport();
  root.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
}

function renderExplorer() {
  if (!currentQuiz) return renderWelcome();
  const quiz = currentQuiz;
  const correctCount = quiz.questions.reduce((count, question) => count + question.choices.filter(choice => choice.correct === true).length, 0);
  const multiCount = quiz.questions.filter(question => question.choices.filter(choice => choice.correct === true).length > 1).length;
  const source = safeSource(quiz.sourceUrl);
  root.innerHTML = `<section class="quiz-loaded-head"><div><div class="page-kicker"><span class="kicker-line" aria-hidden="true"></span> TON QUIZ, EN CLAIR</div><h1>${esc(quiz.title || 'Quiz sans titre')}</h1>${quiz.description ? `<p>${esc(quiz.description)}</p>` : ''}<div class="quiz-meta"><span>${esc(quiz.creator || 'Quiz importé')}</span><span class="meta-dot" aria-hidden="true">·</span><span>${quiz.questions.length} questions${quiz.slideCount ? ` · ${quiz.slideCount} diapositives exclues` : ''}${quiz.skippedCount ? ` · ${quiz.skippedCount} formats non pris en charge` : ''}</span>${source ? `<span class="meta-dot" aria-hidden="true">·</span><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Voir sur Kahoot ${icon('up')}</a>` : ''}</div></div><div class="quiz-actions"><button class="icon-button" id="save-quiz" aria-label="Enregistrer le quiz dans la bibliothèque" title="Enregistrer dans la bibliothèque">${icon('save')}</button><button class="icon-button" id="reload-quiz" aria-label="Actualiser le quiz depuis Kahoot" title="Actualiser depuis Kahoot" ${loading || !isUuid(quiz.id) ? 'disabled' : ''}>${icon('refresh')}</button><details class="export-menu"><summary class="btn btn-secondary">${icon('download')} Exporter ${icon('chevron')}</summary><div class="export-popover"><button data-export="txt">${icon('download')} Corrigé texte <small>.TXT</small></button><button data-export="csv">${icon('download')} Tableau <small>.CSV</small></button><button data-export="json">${icon('download')} Quiz complet <small>.JSON</small></button><button data-print>${icon('cards')} Imprimer / PDF</button></div></details><button class="btn btn-primary" id="open-companion">Ouvrir le compagnon ${icon('arrow')}</button></div></section>${importForm(true)}<div class="quiz-stats"><div class="stat-block"><div class="stat-icon">${icon('grid')}</div><div><strong>${quiz.questions.length}</strong><span>Questions à explorer</span></div></div><div class="stat-block"><div class="stat-icon">${icon('check')}</div><div><strong>${correctCount}</strong><span>Réponses identifiées</span></div></div><div class="stat-block"><div class="stat-icon">${icon('cards')}</div><div><strong>${multiCount}</strong><span>Questions à réponses multiples</span></div></div></div><section aria-label="Questions et réponses"><div class="explorer-toolbar"><div class="search-field">${icon('search')}<input class="search-input" id="question-search" type="search" placeholder="Trouver une question ou une réponse…" aria-label="Chercher dans les questions et réponses" value="${esc(query)}"><span class="search-shortcut" aria-hidden="true">/</span></div><div class="toolbar-actions"><label class="switch-label"><input type="checkbox" id="reveal-all" ${showAll ? 'checked' : ''}> Afficher les réponses</label><button class="btn btn-secondary btn-small" id="copy-answers">${icon('copy')} Copier le corrigé</button></div></div><p class="question-count" id="question-count" aria-live="polite"></p><div class="question-list" id="question-list"></div></section><div class="explorer-bottom"><span>Les réponses affichées sont celles définies par le créateur du quiz.</span><button class="text-button" id="to-library">Retrouver mes quiz ${icon('arrow')}</button></div>`;
  bindImport();
  root.querySelector('#save-quiz').addEventListener('click', () => saveQuiz());
  root.querySelector('#reload-quiz').addEventListener('click', () => loadQuiz(currentQuiz.id));
  root.querySelector('#open-companion').addEventListener('click', () => navigate('companion'));
  root.querySelector('#to-library').addEventListener('click', () => navigate('library'));
  root.querySelector('#question-search').addEventListener('input', event => { query = event.target.value; renderQuestionList(); });
  root.querySelector('#reveal-all').addEventListener('change', event => { showAll = event.target.checked; renderQuestionList(); });
  root.querySelector('#copy-answers').addEventListener('click', async () => { try { await copyAnswers(quiz); toast('Corrigé copié dans le presse-papiers.'); } catch { toast('Copie impossible dans ce navigateur. Utilise l’export TXT.', 'error'); } });
  root.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => { exportQuiz(quiz, button.dataset.export); closeExport(); toast('Export prêt dans tes téléchargements.'); }));
  root.querySelector('[data-print]').addEventListener('click', () => { closeExport(); printQuiz(quiz); });
  renderQuestionList();
}

function closeExport() { root.querySelector('.export-menu')?.removeAttribute('open'); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '')); }
function safeSource(value) { try { const url = new URL(value); return url.protocol === 'https:' && ['create.kahoot.it','play.kahoot.it','kahoot.it'].includes(url.hostname) ? url.href : ''; } catch { return ''; } }
function safeImage(value) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'media.kahoot.it' ? url.href : ''; } catch { return ''; } }
function plainText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

function renderQuestionList() {
  const normalizedQuery = plainText(query.trim());
  const questions = currentQuiz.questions.filter(question => plainText(`${question.question} ${question.choices.map(choice => choice.text).join(' ')}`).includes(normalizedQuery));
  document.querySelector('#question-count').textContent = `${questions.length} question${questions.length > 1 ? 's' : ''}${normalizedQuery ? ` sur ${currentQuiz.questions.length}` : ''} · Repère le texte : l’ordre des choix peut varier en partie.`;
  const list = document.querySelector('#question-list');
  list.innerHTML = questions.length ? questions.map(question => {
    const isRevealed = showAll || revealed.has(String(question.id));
    const image = safeImage(question.image);
    const unknown = !question.choices.some(choice => choice.correct === true);
    const multi = question.choices.filter(choice => choice.correct === true).length > 1;
    return `<article class="question-card" id="q-${esc(String(question.index))}"><div class="question-heading"><span class="question-number" aria-label="Question ${question.index}">${String(question.index).padStart(2, '0')}</span><div class="question-heading-text"><h2 class="question-title">${esc(question.question)}</h2><div class="question-subtitle"><span>${multi ? 'Plusieurs réponses correctes' : 'Une réponse à trouver'}</span>${question.timeLimit ? `<span>·</span><span>${icon('clock')} ${esc(String(question.timeLimit))} s</span>` : ''}</div></div><button type="button" class="reveal-button" data-reveal="${esc(question.id)}" aria-pressed="${isRevealed}" ${showAll ? 'disabled' : ''}>${icon('eye')} ${isRevealed ? 'Masquer' : 'Révéler'}</button></div>${image ? `<img class="question-image" src="${esc(image)}" alt="Illustration de la question ${question.index}" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="answer-list">${question.choices.map((choice, index) => `<div class="answer-option${isRevealed ? (choice.correct === true ? ' is-correct' : choice.correct === false ? ' is-wrong' : ' is-unknown') : ''}"><span class="answer-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span><span class="answer-content"><span class="answer-text">${esc(choice.text)}</span>${safeImage(choice.image) ? `<img class="choice-image" src="${esc(safeImage(choice.image))}" alt="Illustration de la réponse ${String.fromCharCode(65 + index)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>${isRevealed && choice.correct === true ? `<span class="answer-status">${icon('check')}<span>Correcte</span></span>` : ''}</div>`).join('')}</div>${isRevealed && unknown ? '<p class="answer-unknown-note">Aucune correction disponible pour cette question dans les données importées.</p>' : ''}</article>`;
  }).join('') : `<div class="empty-state">${icon('search')}<h2>Aucun résultat pour cette recherche.</h2><p>Essaie un autre mot de la question ou de la réponse.</p><button class="btn btn-secondary" id="clear-search">Effacer la recherche</button></div>`;
  list.querySelectorAll('[data-reveal]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.reveal;
    if (revealed.has(id)) revealed.delete(id); else revealed.add(id);
    renderQuestionList();
    [...list.querySelectorAll('[data-reveal]')].find(item => item.dataset.reveal === id)?.focus({ preventScroll: true });
  }));
  list.querySelector('#clear-search')?.addEventListener('click', () => { query = ''; document.querySelector('#question-search').value = ''; renderQuestionList(); document.querySelector('#question-search').focus(); });
  list.querySelectorAll('.question-image, .choice-image').forEach(image => image.addEventListener('error', () => image.remove(), { once: true }));
}

function bindImport() {
  root.querySelector('#quiz-import').addEventListener('submit', event => { event.preventDefault(); const value = root.querySelector('#quiz-input').value.trim(); if (!value) { root.querySelector('#quiz-input').focus(); return; } loadQuiz(value); });
  root.querySelector('#quiz-input').addEventListener('input', event => { inputValue = event.target.value; });
  root.querySelector('#load-demo')?.addEventListener('click', loadDemo);
  root.querySelector('#import-file').addEventListener('click', () => root.querySelector('#json-file').click());
  root.querySelector('#json-file').addEventListener('change', event => importFile(event.target.files[0]));
}

async function loadQuiz(input) {
  if (loading) return;
  inputValue = input;
  importError = '';
  loading = true;
  const sequence = ++requestSequence;
  render();
  try {
    const response = await fetch(`/api/quiz?input=${encodeURIComponent(input)}`, { signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Le quiz n’a pas pu être chargé.');
    if (sequence !== requestSequence) return;
    loading = false;
    setQuiz(result.quiz || result);
    toast('Quiz chargé. À toi de jouer.');
  } catch (error) {
    if (sequence !== requestSequence) return;
    loading = false;
    importError = error.name === 'TimeoutError' ? 'Kahoot met du temps à répondre. Réessaie dans un instant.' : error.message === 'Failed to fetch' ? 'Connexion impossible. Vérifie que le serveur Ez-Kahoot fonctionne et que tu es connecté à Internet.' : error.message;
    render();
  }
}

async function loadDemo() {
  if (loading) return;
  try {
    const response = await fetch('/demo.json');
    if (!response.ok) throw new Error('Le quiz de démonstration est indisponible.');
    const quiz = await response.json();
    setQuiz(quiz);
    toast('brainwave est prêt. Explore le panel.');
  } catch (error) { importError = error.message; render(); }
}

async function importFile(file) {
  if (!file || loading) return;
  if (file.size > 8 * 1024 * 1024) { importError = 'Ce fichier est trop volumineux. Taille maximale : 8 Mo.'; render(); return; }
  let content;
  try { content = JSON.parse(await file.text()); } catch { importError = 'Ce fichier n’est pas un JSON valide.'; render(); return; }
  loading = true;
  importError = '';
  render();
  try {
    const response = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ce fichier ne contient pas un quiz reconnu.');
    loading = false;
    setQuiz(result.quiz || result);
    toast('Quiz importé depuis ton fichier.');
  } catch (error) { loading = false; importError = error.message; render(); }
}

const about = document.querySelector('#about-dialog');
document.querySelector('#about-button').addEventListener('click', () => about.showModal());
about.addEventListener('click', event => { if (event.target === about) { const box = about.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) about.close(); } });
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); navigate('explorer'); });
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (event.key === '/' && !typing && currentView === 'explorer' && currentQuiz && !about.open) { event.preventDefault(); document.querySelector('#question-search')?.focus(); }
  if (event.key === 'Escape') closeExport();
});
document.addEventListener('click', event => { const menu = root.querySelector('.export-menu'); if (menu?.open && !menu.contains(event.target)) menu.open = false; });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
window.addEventListener('storage', () => { if (currentView === 'library') render(); });
try { readLibrary(); } catch { /* Other features remain usable when browser storage is unavailable. */ }
navigate(views.some(view => view.id === location.hash.slice(1)) ? location.hash.slice(1) : 'explorer', false);
const linkedQuiz = new URLSearchParams(location.search).get('quiz');
if (linkedQuiz && isUuid(linkedQuiz)) loadQuiz(linkedQuiz);

