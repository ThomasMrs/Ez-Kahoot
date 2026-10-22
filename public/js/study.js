import { escapeHtml } from './data.js';

const esc = value => escapeHtml(String(value ?? ''));
const choiceLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const shuffled = list => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function usableQuestions(quiz) {
  return (quiz?.questions || []).filter(question =>
    question.type !== 'content' && question.type !== 'slide' &&
    Array.isArray(question.choices) && question.choices.length > 0 &&
    question.choices.every(choice => typeof choice.correct === 'boolean') &&
    question.choices.some(choice => choice.correct === true)
  );
}

function safeImage(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'media.kahoot.it' ? url.href : '';
  } catch { return ''; }
}

function imageMarkup(question) {
  const image = safeImage(question.image);
  return image ? `<img class="study-question-image" src="${esc(image)}" alt="Illustration de la question" loading="lazy" referrerpolicy="no-referrer">` : '';
}

function choiceImageMarkup(choice, index) {
  const image = safeImage(choice.image);
  return image ? `<img class="study-choice-image" src="${esc(image)}" alt="Proposition ${choiceLetters[index] || index + 1}" loading="lazy" referrerpolicy="no-referrer">` : '';
}

function emptyMarkup(quiz, mode) {
  return `<section class="study-view study-empty">
    <span class="study-kicker">${mode === 'practice' ? 'Entraînement' : 'Flashcards'}</span>
    <div class="study-empty-mark" aria-hidden="true">?</div>
    <h1>${quiz ? 'Pas encore de réponses à réviser.' : 'Votre prochaine bonne réponse commence ici.'}</h1>
    <p>${quiz ? 'Ce quiz ne contient aucune question dont la correction est connue. Choisissez un autre quiz pour commencer.' : 'Ouvrez un quiz dans Explorer. Vous pourrez ensuite vous entraîner ou parcourir ses flashcards.'}</p>
    <button type="button" class="study-button study-button-primary" data-action="explore">Explorer les quiz <span aria-hidden="true">↗</span></button>
  </section>`;
}

function bindEmpty(container, ctx) {
  const listener = event => {
    if (event.target.closest('[data-action="explore"]')) ctx.navigate('explorer');
  };
  container.addEventListener('click', listener);
  return () => container.removeEventListener('click', listener);
}

export function renderPractice(container, ctx) {
  const quiz = ctx.getQuiz();
  const questions = usableQuestions(quiz);
  if (!quiz || !questions.length) {
    container.innerHTML = emptyMarkup(quiz, 'practice');
    return bindEmpty(container, ctx);
  }

  let phase = 'setup';
  let queue = [...questions];
  let position = 0;
  let selected = new Set();
  let submitted = false;
  let history = [];
  let mix = true;
  let timerMode = 'off';
  let interval = null;
  let secondsLeft = 0;
  let timerTotal = 0;
  let timedOut = false;
  let disposed = false;

  const stopTimer = () => { if (interval !== null) clearInterval(interval); interval = null; };
  const correctText = question => question.choices.filter(choice => choice.correct).map(choice => choice.text).join(' · ');
  const focus = selector => container.querySelector(selector)?.focus({ preventScroll: true });
  const title = `<header class="study-heading"><div><span class="study-kicker">À votre rythme</span><h1>Entraînement</h1><p>${esc(quiz.title)}</p></div><span class="study-heading-note">On essaie. On retient.</span></header>`;

  function startTimer() {
    stopTimer();
    if (timerMode === 'off' || submitted || phase !== 'active') return;
    const requested = timerMode === 'quiz' ? Number(queue[position].timeLimit) || 20 : Number(timerMode);
    timerTotal = Math.max(5, Math.min(600, requested));
    secondsLeft = timerTotal;
    const deadline = performance.now() + timerTotal * 1000;
    const update = () => {
      secondsLeft = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      const label = container.querySelector('[data-timer-label]');
      const progress = container.querySelector('[data-timer-progress]');
      if (label) label.textContent = `${secondsLeft} s`;
      if (progress) progress.value = secondsLeft;
      if (secondsLeft <= 0) { timedOut = true; submit(); }
    };
    update();
    interval = setInterval(update, 200);
  }

  function renderSetup() {
    const ignored = (quiz.questions?.length || 0) - questions.length;
    container.innerHTML = `<div class="study-view">${title}<section class="study-setup">
      <div class="study-setup-intro"><span class="study-number">${questions.length.toString().padStart(2, '0')}</span><div><h2>Faites le point, question après question.</h2><p>Choisissez vos réponses, découvrez la correction et reprenez celles qui vous résistent.</p>${ignored > 0 ? `<p class="study-small">${ignored} ${ignored > 1 ? 'éléments sans correction sont laissés de côté' : 'élément sans correction est laissé de côté'}.</p>` : ''}</div></div>
      <div class="study-options"><label class="study-check"><input type="checkbox" name="mix" ${mix ? 'checked' : ''}><span>Mélanger les questions</span></label><label class="study-select-label" for="practice-timer">Chronomètre<select id="practice-timer" name="timer"><option value="off">Sans chrono</option><option value="quiz">Durée du quiz</option><option value="10">10 secondes</option><option value="20">20 secondes</option><option value="30">30 secondes</option><option value="60">60 secondes</option></select></label></div>
      <div class="study-setup-footer"><span>Les réponses restent masquées jusqu’à votre validation.</span><button type="button" class="study-button study-button-primary" data-action="start">Commencer <span aria-hidden="true">→</span></button></div>
    </section></div>`;
    container.querySelector('[name="timer"]').value = timerMode;
  }

  function renderQuestion(moveFocus = false) {
    const question = queue[position];
    const multiple = question.multiSelect || question.choices.filter(choice => choice.correct).length > 1;
    const result = history[position];
    const score = history.filter(item => item.correct).length;
    container.innerHTML = `<div class="study-view">${title}
      <div class="study-session-bar"><span>Question <strong>${position + 1}</strong> sur ${queue.length}</span><span>${score} ${score > 1 ? 'réponses justes' : 'réponse juste'}</span><button type="button" class="study-text-button" data-action="settings">Recommencer</button></div>
      <progress class="study-progress" value="${position + (submitted ? 1 : 0)}" max="${queue.length}" aria-label="Progression"></progress>
      <section class="study-question-card"><div class="study-question-meta"><span>${multiple ? 'Plusieurs réponses possibles' : 'Une seule réponse'}</span>${timerMode !== 'off' ? `<span class="study-timer ${timedOut ? 'is-elapsed' : ''}"><span class="study-clock" aria-hidden="true"></span><span data-timer-label>${submitted ? (timedOut ? 'Temps écoulé' : 'Réponse validée') : `${timerTotal || 20} s`}</span>` : '<span>Sans chrono</span>'}</div>
      ${timerMode !== 'off' && !submitted ? `<progress class="study-timer-progress" data-timer-progress value="${timerTotal || 20}" max="${timerTotal || 20}" aria-label="Temps restant"></progress>` : ''}
      <h2 tabindex="-1" class="study-question-title">${esc(question.question)}</h2>${imageMarkup(question)}
      <div class="study-choices" role="group" aria-label="Choix de réponse">${question.choices.map((choice, index) => {
        const chosen = selected.has(index);
        const status = submitted ? (choice.correct ? 'is-correct' : chosen ? 'is-wrong' : 'is-muted') : chosen ? 'is-selected' : '';
        return `<button type="button" class="study-choice ${status}" data-action="choice" data-choice="${index}" aria-pressed="${chosen}" ${submitted ? 'disabled' : ''}><span class="study-choice-letter">${choiceLetters[index] || index + 1}</span><span class="study-choice-content"><span class="study-choice-text">${esc(choice.text)}</span>${choiceImageMarkup(choice, index)}</span>${submitted && choice.correct ? '<span class="study-choice-state">Bonne réponse</span>' : chosen ? `<span class="study-choice-state">${submitted ? 'Votre choix' : 'Sélectionné'}</span>` : ''}</button>`;
      }).join('')}</div>
      ${submitted ? `<div class="study-feedback ${result.correct ? 'is-correct' : 'is-wrong'}" role="status" tabindex="-1"><strong>${result.correct ? 'Bien joué.' : timedOut ? 'Le temps est écoulé.' : 'Pas cette fois.'}</strong><p>${result.correct ? 'Vous avez trouvé la bonne combinaison.' : `À retenir : ${esc(correctText(question))}`}</p></div>` : '<p class="study-selection-hint">Sélectionnez votre réponse, puis validez.</p>'}
      <div class="study-question-footer"><span>${submitted ? 'Une bonne occasion de retenir la réponse.' : multiple ? 'Toutes les bonnes réponses comptent.' : 'Prenez le temps de lire chaque proposition.'}</span><button type="button" class="study-button study-button-primary" data-action="${submitted ? 'next' : 'submit'}" ${!submitted && !selected.size ? 'disabled' : ''}>${submitted ? position === queue.length - 1 ? 'Voir le bilan' : 'Question suivante' : 'Valider ma réponse'} <span aria-hidden="true">→</span></button></div>
      </section></div>`;
    if (moveFocus) focus(submitted ? '.study-feedback' : '.study-question-title');
  }

  function begin(list = questions) {
    queue = mix ? shuffled(list) : [...list];
    position = 0;
    selected = new Set();
    history = [];
    submitted = false;
    timedOut = false;
    timerTotal = timerMode === 'quiz' ? Math.max(5, Math.min(600, Number(queue[0].timeLimit) || 20)) : Number(timerMode) || 0;
    phase = 'active';
    renderQuestion(true);
    startTimer();
  }

  function submit() {
    if (submitted || phase !== 'active' || disposed) return;
    stopTimer();
    const question = queue[position];
    const expected = question.choices.flatMap((choice, index) => choice.correct ? [index] : []);
    const correct = selected.size === expected.length && expected.every(index => selected.has(index));
    history[position] = { question, correct, selected: [...selected], timedOut };
    submitted = true;
    renderQuestion(true);
  }

  function renderSummary() {
    stopTimer();
    phase = 'summary';
    const errors = history.filter(item => !item.correct);
    const score = history.length - errors.length;
    const percent = Math.round(score / history.length * 100);
    container.innerHTML = `<div class="study-view">${title}<section class="study-summary">
      <span class="study-kicker">Votre bilan</span><h2 tabindex="-1">${percent === 100 ? 'Vous avez tout bon.' : percent >= 70 ? 'Les bases sont bien là.' : 'Chaque essai fait avancer.'}</h2>
      <div class="study-score"><strong>${score}<span> / ${history.length}</span></strong><div><b>${percent} %</b><span>de bonnes réponses</span></div></div>
      <p>${errors.length ? `${errors.length} ${errors.length > 1 ? 'questions à reprendre pour ancrer les réponses.' : 'question à reprendre pour ancrer la réponse.'}` : 'Toutes les questions de cette série sont maîtrisées.'}</p>
      <div class="study-summary-actions">${errors.length ? '<button type="button" class="study-button study-button-primary" data-action="retry-errors">Rejouer mes erreurs <span aria-hidden="true">→</span></button>' : ''}<button type="button" class="study-button ${errors.length ? 'study-button-secondary' : 'study-button-primary'}" data-action="retry-all">Rejouer tout le quiz</button><button type="button" class="study-text-button" data-action="settings">Réglages</button></div>
      ${errors.length ? `<div class="study-review"><h3>À garder en tête</h3><ol>${errors.map(item => `<li><p>${esc(item.question.question)}</p><span>${esc(correctText(item.question))}</span></li>`).join('')}</ol></div>` : '<div class="study-perfect-note">Prochaine étape : retrouvez les réponses avec les flashcards.<button type="button" class="study-text-button" data-action="flashcards">Ouvrir les flashcards →</button></div>'}</section></div>`;
    focus('.study-summary h2');
  }

  function handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !container.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'start' || action === 'retry-all') begin();
    else if (action === 'retry-errors') begin(history.filter(item => !item.correct).map(item => item.question));
    else if (action === 'settings') { stopTimer(); phase = 'setup'; renderSetup(); focus('[data-action="start"]'); }
    else if (action === 'flashcards') ctx.navigate('flashcards');
    else if (action === 'choice' && !submitted) {
      const index = Number(button.dataset.choice);
      const question = queue[position];
      if (question.multiSelect || question.choices.filter(choice => choice.correct).length > 1) {
        selected.has(index) ? selected.delete(index) : selected.add(index);
      } else selected = new Set([index]);
      container.querySelectorAll('[data-action="choice"]').forEach(choice => {
        const chosen = selected.has(Number(choice.dataset.choice));
        choice.classList.toggle('is-selected', chosen);
        choice.setAttribute('aria-pressed', String(chosen));
        choice.querySelector('.study-choice-state')?.remove();
        if (chosen) choice.insertAdjacentHTML('beforeend', '<span class="study-choice-state">Sélectionné</span>');
      });
      container.querySelector('[data-action="submit"]').disabled = selected.size === 0;
    } else if (action === 'submit' && selected.size) submit();
    else if (action === 'next' && submitted) {
      if (position >= queue.length - 1) renderSummary();
      else {
        position++;
        selected = new Set(); submitted = false; timedOut = false;
        timerTotal = timerMode === 'quiz' ? Math.max(5, Math.min(600, Number(queue[position].timeLimit) || 20)) : Number(timerMode) || 0;
        renderQuestion(true); startTimer();
      }
    }
  }
  function handleChange(event) {
    if (phase !== 'setup') return;
    if (event.target.name === 'mix') mix = event.target.checked;
    if (event.target.name === 'timer') timerMode = event.target.value;
  }
  renderSetup();
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
  return () => { disposed = true; stopTimer(); container.removeEventListener('click', handleClick); container.removeEventListener('change', handleChange); };
}

export function renderFlashcards(container, ctx) {
  const quiz = ctx.getQuiz();
  const questions = usableQuestions(quiz);
  if (!quiz || !questions.length) {
    container.innerHTML = emptyMarkup(quiz, 'flashcards');
    return bindEmpty(container, ctx);
  }
  let deck = [...questions];
  let position = 0;
  let flipped = false;
  let random = false;

  function render(moveFocus = false) {
    const question = deck[position];
    const answers = question.choices.filter(choice => choice.correct);
    container.innerHTML = `<div class="study-view study-flashcards"><header class="study-heading"><div><span class="study-kicker">Un recto. Un déclic.</span><h1>Flashcards</h1><p>${esc(quiz.title)}</p></div><span class="study-heading-note">Retrouver, puis vérifier.</span></header>
      <div class="study-flash-toolbar"><span>Carte <strong>${position + 1}</strong> sur ${deck.length}</span><label class="study-check"><input type="checkbox" name="random-cards" ${random ? 'checked' : ''}><span>Ordre aléatoire</span></label></div>
      <progress class="study-progress" value="${position + 1}" max="${deck.length}" aria-label="Progression des flashcards"></progress>
      <button type="button" class="study-flashcard ${flipped ? 'is-flipped' : ''}" data-action="flip" aria-pressed="${flipped}" aria-label="${flipped ? 'Réponses affichées. Revenir à la question.' : 'Question affichée. Retourner la carte pour voir les réponses.'}">
        <span class="study-flashcard-top"><span>${flipped ? answers.length > 1 ? 'Les réponses' : 'La réponse' : 'La question'}</span><span aria-hidden="true">${flipped ? 'VERSO' : 'RECTO'}</span></span>
        <span class="study-flashcard-body">${flipped ? answers.map(choice => `<span class="study-flashcard-answer"><span>${esc(choice.text)}</span>${choiceImageMarkup(choice, question.choices.indexOf(choice))}</span>`).join('') : `<span class="study-flashcard-question">${esc(question.question)}</span>${imageMarkup(question)}`}</span>
        <span class="study-flashcard-bottom">${flipped ? 'Cliquez pour revoir la question' : 'Trouvez la réponse, puis retournez la carte'}<span aria-hidden="true">↻</span></span>
      </button>
      <div class="study-flash-navigation"><button type="button" class="study-button study-button-secondary" data-action="previous" ${position === 0 ? 'disabled' : ''}><span aria-hidden="true">←</span> Précédente</button><button type="button" class="study-button study-flip-button" data-action="flip">${flipped ? 'Revoir la question' : 'Retourner la carte'} <span aria-hidden="true">↻</span></button><button type="button" class="study-button study-button-secondary" data-action="next" ${position === deck.length - 1 ? 'disabled' : ''}>Suivante <span aria-hidden="true">→</span></button></div>
      <p class="study-flash-hint" aria-live="polite">${position === deck.length - 1 ? 'Dernière carte. Vous pouvez reprendre le paquet ou passer à l’entraînement.' : 'Utilisez les boutons, ou les flèches du clavier. Espace retourne la carte.'}</p>
      <div class="study-flash-bottom-actions"><button type="button" class="study-text-button" data-action="restart">Reprendre le paquet</button><button type="button" class="study-text-button" data-action="practice">Passer à l’entraînement →</button></div></div>`;
    if (moveFocus) container.querySelector('.study-flashcard')?.focus({ preventScroll: true });
  }
  function changeCard(direction) {
    const next = Math.max(0, Math.min(deck.length - 1, position + direction));
    if (next === position) return;
    position = next; flipped = false; render(true);
  }
  function handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !container.contains(button) || button.disabled) return;
    if (button.dataset.action === 'flip') { flipped = !flipped; render(true); }
    if (button.dataset.action === 'next') changeCard(1);
    if (button.dataset.action === 'previous') changeCard(-1);
    if (button.dataset.action === 'restart') { position = 0; flipped = false; if (random) deck = shuffled(questions); render(true); }
    if (button.dataset.action === 'practice') ctx.navigate('practice');
  }
  function handleChange(event) {
    if (event.target.name !== 'random-cards') return;
    random = event.target.checked;
    deck = random ? shuffled(questions) : [...questions];
    position = 0; flipped = false; render();
    container.querySelector('[name="random-cards"]')?.focus();
  }
  function handleKey(event) {
    if (event.target.matches('input, select, textarea') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); changeCard(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); changeCard(-1); }
  }
  render();
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
  container.addEventListener('keydown', handleKey);
  return () => { container.removeEventListener('click', handleClick); container.removeEventListener('change', handleChange); container.removeEventListener('keydown', handleKey); };
}
