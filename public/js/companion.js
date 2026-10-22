import { escapeHtml as esc } from './data.js';
import { findMatches } from '../shared/matching.js';
import { copyConsoleScript, downloadConsoleScript } from './console-builder.js';

const symbols = {
  link: '<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] || symbols.link}</svg>`;

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Use the local fallback. */ }
  }
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = value;
  field.className = 'cp-clipboard-fallback';
  field.setAttribute('aria-label', 'Contenu à copier');
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  previous?.focus();
  if (!copied) throw new Error('Copie indisponible. Sélectionne le texte pour le copier.');
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'media.kahoot.it' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function answerText(choice) {
  return choice.image ? `${choice.text} [image : ${choice.image}]` : choice.text;
}

export function renderCompanion(container, ctx) {
  const quiz = ctx.getQuiz();
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const knownCount = questions.filter(question => question.choices.some(choice => choice.correct === true)).length;
  const multipleCount = questions.filter(question => question.choices.filter(choice => choice.correct === true).length > 1).length;
  let config = null;
  let connectionBusy = true;
  let sendBusy = false;
  let connectionError = '';
  let connectionMessage = '';
  let revealCode = false;
  let matches = [];
  let disposed = false;
  let searchTimer;
  const controller = new AbortController();

  container.innerHTML = `<div class="companion-view">
    <header class="cp-heading"><div><p class="cp-kicker">LE LIEN ENTRE TES OUTILS</p><h1>Le compagnon navigateur.</h1><p>Retrouve le corrigé d’une question affichée, sans quitter ton onglet.</p></div><span class="cp-heading-note">Lecture au clic. Réponses en clair.</span></header>
    <div class="cp-grid">
      <section class="cp-panel cp-connect" aria-labelledby="cp-connect-title">
        <div class="cp-panel-heading"><div class="cp-panel-icon">${icon('link')}</div><div><h2 id="cp-connect-title">Relier le navigateur</h2><p>Une extension, une connexion locale.</p></div></div>
        <a class="cp-download btn btn-primary" href="/downloads/Ez-Kahoot-Companion.zip" download>${icon('download')} Télécharger le compagnon ${icon('arrow')}</a>
        <details class="cp-guide"><summary>Installer l’extension en trois étapes <span aria-hidden="true">+</span></summary><ol><li><strong>Décompresse l’archive.</strong><span>Garde le dossier contenant le fichier manifest.json.</span></li><li><strong>Ouvre <code>chrome://extensions</code>.</strong><span>Active le mode développeur, clique sur « Charger l’extension non empaquetée », puis choisis ce dossier.</span></li><li><strong>Ouvre Ez-Kahoot Companion.</strong><span>Épingle son icône, colle le code ci-dessous dans l’extension, puis clique sur « Connecter ».</span></li></ol></details>
        <div class="cp-connection-state" data-connection-region aria-live="polite"></div>
        <div class="cp-prepared" data-prepared-region></div>
        <p class="cp-session-note">La connexion reste locale. Garde Ez-Kahoot lancé pendant l’utilisation du compagnon.</p>
      </section>
      <section class="cp-panel cp-search" aria-labelledby="cp-search-title">
        <div class="cp-panel-heading"><div class="cp-panel-icon cp-search-icon">${icon('search')}</div><div><h2 id="cp-search-title">Retrouver une question</h2><p>Une recherche immédiate dans le quiz chargé.</p></div></div>
        <div class="cp-current-quiz"><span>QUIZ ACTUEL</span><strong>${esc(quiz?.title || 'Aucun quiz chargé')}</strong>${quiz ? `<span>${questions.length} questions</span>` : '<button type="button" class="cp-text-button" data-cp-action="explore">Choisir un quiz →</button>'}</div>
        <form class="cp-match-form"><label for="cp-question-input">Question à retrouver</label><textarea id="cp-question-input" name="question" rows="4" maxlength="4000" placeholder="Colle la question affichée ou quelques mots précis…" ${quiz ? '' : 'disabled'}></textarea><div class="cp-search-actions"><button type="button" class="cp-text-button" data-cp-action="clear-search" disabled>Effacer</button><button type="submit" class="btn btn-primary" ${quiz ? '' : 'disabled'}>Retrouver ${icon('arrow')}</button></div></form>
        <div class="cp-results" data-results-region aria-live="polite"></div>
      </section>
    </div>
    <section class="cp-pocket" aria-labelledby="cp-pocket-title"><div class="cp-pocket-icon" aria-hidden="true">&lt;/&gt;</div><div class="cp-pocket-copy"><p class="cp-kicker">ALTERNATIVE PONCTUELLE</p><h2 id="cp-pocket-title">Script de poche</h2><p>Le corrigé de ce quiz est embarqué. Dans la console de ton onglet Kahoot, le script affiche les correspondances et se ferme avec sa croix.</p></div><div class="cp-pocket-actions"><button type="button" class="btn btn-secondary" data-cp-action="copy-console" ${quiz ? '' : 'disabled'}>${icon('copy')} Copier le script</button><button type="button" class="cp-text-button" data-cp-action="download-console" ${quiz ? '' : 'disabled'}>${icon('download')} Télécharger .js</button></div></section>
    <section class="cp-diagnostic" aria-labelledby="cp-diagnostic-title"><div class="cp-diagnostic-intro"><p class="cp-kicker">LES DONNÉES DU QUIZ</p><h2 id="cp-diagnostic-title">Savoir ce qui est disponible.</h2><p>Les réponses proviennent du quiz chargé.</p></div><div class="cp-stat-grid"><div><strong>${questions.length}</strong><span>Questions chargées</span></div><div><strong>${knownCount}</strong><span>Avec un corrigé</span></div><div><strong>${questions.length - knownCount}</strong><span>Sans réponse connue</span></div><div><strong>${multipleCount}</strong><span>À réponses multiples</span></div></div><p class="cp-diagnostic-note">L’extension rapproche le texte visible du corrigé envoyé. Une ressemblance reste à vérifier ; un PIN seul ne fournit pas le corrigé d’un quiz.</p></section>
  </div>`;

  const connectionRegion = container.querySelector('[data-connection-region]');
  const preparedRegion = container.querySelector('[data-prepared-region]');
  const resultsRegion = container.querySelector('[data-results-region]');
  const input = container.querySelector('#cp-question-input');

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('Le serveur a renvoyé une réponse illisible. Relance Ez-Kahoot puis réessaie.'); }
    if (!response.ok) throw new Error(result.error || 'Cette action n’a pas pu aboutir.');
    return result;
  }

  function renderConnection() {
    if (disposed) return;
    connectionRegion.innerHTML = `<div class="cp-code-heading"><label for="cp-connection-code">Code de connexion</label><span class="cp-state ${config && !connectionError ? 'is-ready' : ''}"><i aria-hidden="true"></i>${connectionBusy ? 'Connexion…' : config && !connectionError ? 'Serveur prêt' : 'À reconnecter'}</span></div>
      <div class="cp-code-field"><input id="cp-connection-code" type="${revealCode ? 'text' : 'password'}" readonly autocomplete="off" spellcheck="false" value="${esc(config?.connectionCode || '')}" placeholder="${connectionBusy ? 'Préparation du code…' : 'Code indisponible'}" ${config ? '' : 'disabled'}><button type="button" class="cp-icon-button" data-cp-action="reveal-code" aria-label="${revealCode ? 'Masquer le code de connexion' : 'Afficher le code de connexion'}" aria-pressed="${revealCode}" ${config && !connectionBusy ? '' : 'disabled'}>${icon('eye')}</button></div>
      <div class="cp-code-actions"><button type="button" class="btn btn-secondary" data-cp-action="copy-code" ${config && !connectionBusy ? '' : 'disabled'}>${icon('copy')} Copier le code</button><button type="button" class="cp-text-button" data-cp-action="${config ? 'reset' : 'retry'}" ${connectionBusy ? 'disabled' : ''}>${config ? 'Régénérer le code' : 'Réessayer'}</button></div>
      <p class="cp-code-help">Régénérer le code déconnecte les extensions déjà associées.</p>
      ${connectionError ? `<p class="cp-error" role="alert">${esc(connectionError)}</p>` : ''}${connectionMessage ? `<p class="cp-success" role="status">${icon('check')}${esc(connectionMessage)}</p>` : ''}`;
  }

  function renderPrepared() {
    if (disposed) return;
    const prepared = config?.preparedQuiz;
    preparedRegion.innerHTML = `<div class="cp-prepared-copy"><span class="cp-small-label">PRÊT POUR LE COMPAGNON</span><strong>${esc(prepared?.title || 'Aucun quiz envoyé')}</strong><p>${prepared ? `${Number(prepared.questionCount) || 0} questions disponibles dans l’extension.` : 'Envoie un quiz pour pouvoir retrouver ses réponses depuis l’extension.'}</p></div><button type="button" class="btn ${quiz ? 'btn-primary' : 'btn-secondary'}" data-cp-action="${quiz ? 'prepare' : 'explore'}" ${sendBusy || (quiz && (!config || connectionBusy)) ? 'disabled' : ''}>${sendBusy ? 'Envoi…' : quiz ? 'Envoyer ce quiz au compagnon' : 'Charger un quiz'} ${icon('arrow')}</button>`;
  }

  function renderResults(moveFocus = false) {
    if (disposed) return;
    const query = input.value.trim();
    container.querySelector('[data-cp-action="clear-search"]').disabled = !query;
    if (!query) {
      matches = [];
      resultsRegion.innerHTML = `<div class="cp-search-empty">${icon('search')}<p>${quiz ? 'Une question en tête ? Retrouve sa réponse dans le quiz.' : 'Charge un quiz pour lancer une recherche.'}</p></div>`;
      return;
    }
    matches = quiz ? findMatches(quiz, query, 5) : [];
    const exactCount = matches.filter(match => match.exact).length;
    const ambiguous = exactCount > 1 || matches.some(match => match.ambiguous);
    resultsRegion.innerHTML = `<div class="cp-result-heading"><h3 tabindex="-1">${matches.length ? `${matches.length} résultat${matches.length > 1 ? 's' : ''}` : 'Aucune correspondance fiable.'}</h3><span>${esc(quiz?.title || '')}</span></div>
      ${ambiguous ? '<p class="cp-ambiguity">Plusieurs questions se ressemblent. Vérifie leurs propositions avant de retenir une réponse.</p>' : ''}
      ${matches.length ? `<div class="cp-match-list">${matches.map((match, index) => {
        const question = match.question;
        const choices = Array.isArray(question?.choices) ? question.choices : [];
        const correct = choices.filter(choice => choice.correct === true);
        const percent = Math.round(Math.max(0, Math.min(1, Number(match.score) || 0)) * 100);
        const questionImage = safeImage(question?.image);
        return `<article class="cp-match ${match.exact ? 'is-exact' : ''}"><div class="cp-match-meta"><span class="cp-match-type">${match.exact ? 'Correspondance exacte' : 'Ressemblance à vérifier'}</span><span>${percent} %</span></div><h4>${esc(question?.question || 'Question sans titre')}</h4>${questionImage ? `<img class="cp-question-image" src="${esc(questionImage)}" alt="Illustration de la question" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="cp-correct-answers"><span class="cp-small-label">${correct.length > 1 ? 'RÉPONSES DU CORRIGÉ' : 'RÉPONSE DU CORRIGÉ'}</span>${correct.length ? `<ul>${correct.map(choice => `<li>${icon('check')}<div><span>${esc(choice.text)}</span>${safeImage(choice.image) ? `<img class="cp-choice-image" src="${esc(safeImage(choice.image))}" alt="Illustration d’une réponse correcte" loading="lazy" referrerpolicy="no-referrer">` : ''}</div></li>`).join('')}</ul>` : '<p class="cp-no-correction">La source ne contient aucune réponse déclarée correcte pour cette question.</p>'}</div><div class="cp-match-footer"><details><summary>Voir les propositions</summary><ol>${choices.map(choice => `<li>${esc(choice.text)}${choice.correct === true ? '<span>Correcte</span>' : ''}${safeImage(choice.image) ? `<img class="cp-choice-image" src="${esc(safeImage(choice.image))}" alt="Illustration de la proposition" loading="lazy" referrerpolicy="no-referrer">` : ''}</li>`).join('')}</ol></details><button type="button" class="cp-text-button" data-cp-action="copy-match" data-match-index="${index}" ${correct.length ? '' : 'disabled'}>${icon('copy')} Copier</button></div></article>`;
      }).join('')}</div>` : '<p class="cp-no-results">Essaie une phrase plus complète ou vérifie que le bon quiz est chargé.</p>'}`;
    if (moveFocus) resultsRegion.querySelector('h3')?.focus({ preventScroll: true });
    resultsRegion.querySelectorAll('img').forEach(image => image.addEventListener('error', () => image.remove(), { once: true }));
  }

  async function loadConfiguration(reset = false) {
    if (disposed) return;
    connectionBusy = true;
    connectionError = '';
    connectionMessage = '';
    renderConnection();
    renderPrepared();
    try {
      const result = await request(reset ? '/api/companion/reset' : '/api/companion/config', reset ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {});
      if (disposed) return;
      if (typeof result.connectionCode !== 'string' || !result.connectionCode) throw new Error('Le serveur ne fournit pas de code de connexion. Relance la version à jour d’Ez-Kahoot.');
      config = result;
      revealCode = false;
      if (reset) connectionMessage = 'Nouveau code prêt. Reconnecte ton extension avec ce code.';
    } catch (error) {
      if (disposed || error.name === 'AbortError') return;
      config = null;
      connectionError = error.message;
    } finally {
      if (!disposed) { connectionBusy = false; renderConnection(); renderPrepared(); }
    }
  }

  async function prepareQuiz() {
    if (!quiz || sendBusy || !config) return;
    sendBusy = true;
    connectionError = '';
    connectionMessage = '';
    renderPrepared();
    renderConnection();
    try {
      const prepared = await request('/api/companion/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quiz) });
      if (disposed) return;
      config.preparedQuiz = prepared;
      connectionMessage = 'Quiz envoyé. Dans l’extension, clique sur « Lire cet onglet ».';
      ctx.toast('Quiz prêt dans le compagnon.');
    } catch (error) {
      if (disposed || error.name === 'AbortError') return;
      connectionError = error.message;
    } finally {
      if (!disposed) { sendBusy = false; renderPrepared(); renderConnection(); }
    }
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-cp-action]');
    if (!button || !container.contains(button) || button.disabled) return;
    const action = button.dataset.cpAction;
    if (action === 'explore') return ctx.navigate('explorer');
    if (action === 'retry') return loadConfiguration();
    if (action === 'reset') return loadConfiguration(true);
    if (action === 'prepare') return prepareQuiz();
    if (action === 'copy-console' || action === 'download-console') {
      if (!quiz) return;
      try {
        if (action === 'copy-console') await copyConsoleScript(quiz);
        else await downloadConsoleScript(quiz);
        if (!disposed) ctx.toast(action === 'copy-console' ? 'Script copié, prêt pour la console de ton onglet Kahoot.' : 'Script téléchargé.');
      } catch (error) { if (!disposed) ctx.toast(error.message || 'Le script n’a pas pu être préparé.', 'error'); }
      return;
    }
    if (action === 'reveal-code') {
      revealCode = !revealCode;
      renderConnection();
      connectionRegion.querySelector('[data-cp-action="reveal-code"]')?.focus();
      return;
    }
    if (action === 'clear-search') {
      clearTimeout(searchTimer);
      input.value = '';
      renderResults();
      input.focus();
      return;
    }
    let text;
    if (action === 'copy-code') text = config?.connectionCode;
    if (action === 'copy-match') {
      const question = matches[Number(button.dataset.matchIndex)]?.question;
      text = question?.choices.filter(choice => choice.correct === true).map(answerText).join('\n');
    }
    if (typeof text !== 'string' || !text) return;
    try { await copyText(text); if (!disposed) ctx.toast(action === 'copy-code' ? 'Code copié. Colle-le dans le compagnon.' : 'Réponse copiée.'); }
    catch (error) { if (!disposed) ctx.toast(error.message, 'error'); }
  }

  function handleInput(event) {
    if (event.target !== input) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderResults(), 120);
  }

  function handleSubmit(event) {
    if (!event.target.matches('.cp-match-form')) return;
    event.preventDefault();
    clearTimeout(searchTimer);
    renderResults(true);
  }

  renderConnection();
  renderPrepared();
  renderResults();
  container.addEventListener('click', handleClick);
  container.addEventListener('input', handleInput);
  container.addEventListener('submit', handleSubmit);
  loadConfiguration();
  return () => {
    disposed = true;
    controller.abort();
    clearTimeout(searchTimer);
    container.removeEventListener('click', handleClick);
    container.removeEventListener('input', handleInput);
    container.removeEventListener('submit', handleSubmit);
  };
}
