export function mountLivePanel({ quiz, readPage, decideAnswer, activateAnswer, initialAutoClick = false, onRefresh = null }) {
  if (typeof readPage !== 'function' || typeof decideAnswer !== 'function' || typeof activateAnswer !== 'function') {
    throw new TypeError('Le compagnon nécessite un lecteur, un corrigé et une action de réponse.');
  }
  const previous = document.getElementById('ez-kahoot-live-panel');
  previous?.dispatchEvent(new Event('ez-live-dispose'));
  previous?.remove();
  const previousFocus = document.activeElement;
  const hasQuiz = value => Array.isArray(value?.questions) && value.questions.length > 0;
  const host = document.createElement('div');
  host.id = 'ez-kahoot-live-panel';
  host.style.cssText = 'position:fixed;top:12px;right:12px;width:min(330px,calc(100vw - 24px));z-index:2147483647;color-scheme:light;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.addEventListener('click', event => event.stopPropagation());
  shadow.addEventListener('keydown', event => event.stopPropagation());
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;font:13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#232825;color-scheme:light}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}
    button:focus-visible,input:focus-visible{outline:3px solid #a83c20;outline-offset:3px}
    .panel{background:#fffefa;border:1px solid #d7ddcf;border-radius:12px;box-shadow:0 8px 32px #101a2229;overflow:hidden}
    header{display:flex;align-items:center;gap:9px;padding:11px 12px;background:#232825;color:#fffefa}
    .logo{display:grid;place-items:center;flex:none;width:27px;height:27px;background:#ff7855;color:#232825;border-radius:6px;font-weight:850;font-size:17px;letter-spacing:-2px;padding-right:2px}
    h2{font-size:14px;letter-spacing:-.025em;margin:0;line-height:1.3}.subtitle{display:block;font-size:9px;color:#c8d3be;margin-top:2px}
    .header-copy{flex:1;min-width:0}.icon-button{display:grid;place-items:center;flex:none;width:30px;height:30px;border:1px solid #697461;border-radius:6px;background:transparent;color:#fffefa;font-size:19px;line-height:1}
    .icon-button:hover{background:#3b4535}.body{padding:13px 14px;max-height:min(520px,calc(100vh - 140px));overflow:auto}
    .quiz{font-size:10px;color:#5d655c;margin:0 0 10px;overflow-wrap:anywhere}.state{display:inline-flex;gap:6px;align-items:center;font-size:10px;font-weight:700;color:#526047;margin:0 0 9px}
    .state::before{content:'';width:6px;height:6px;flex:none;border-radius:50%;background:#929d89}.state[data-state=ready]{color:#315c2a}.state[data-state=ready]::before{background:#4a7d3a}
    .state[data-state=ambiguous],.state[data-state=unmapped],.state[data-state=unsupported]{color:#795025}.state[data-state=error]{color:#983c26}
    .question{font-size:11px;font-weight:600;line-height:1.55;margin:0 0 10px;overflow-wrap:anywhere}.answers{display:grid;gap:6px;list-style:none;padding:0;margin:0}
    .answers li{background:#eaf1e2;border:1px solid #d5dfcb;border-radius:7px;padding:10px 11px;color:#2f5125;font-size:13px;font-weight:650;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
    .message{font-size:10px;line-height:1.65;color:#5d655c;margin:10px 0 0;overflow-wrap:anywhere}.message[data-error=true]{color:#963b26}
    .controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border-top:1px solid #dfe3d8}
    label{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;cursor:pointer}input{accent-color:#365d2c;margin:0;width:15px;height:15px}
    .answer-button{border:1px solid #232825;border-radius:6px;background:#232825;color:#fffefa;padding:7px 10px;font-size:10px;font-weight:650;min-height:32px}.answer-button:hover:not(:disabled){background:#3d4d37}
    footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;background:#f3f5ed;border-top:1px solid #e1e5d9;font-size:9px;color:#5d655c}
    .compact-answer{padding:10px 12px;font-size:12px;font-weight:650;line-height:1.5;color:#2f5125;margin:0;max-height:80px;overflow:auto;overflow-wrap:anywhere}
    [hidden]{display:none!important}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  };
  const button = (className, value, label) => {
    const element = node('button', className, value);
    element.type = 'button';
    if (label) element.setAttribute('aria-label', label);
    return element;
  };
  const panel = node('section', 'panel');
  panel.setAttribute('aria-label', 'Ez-Kahoot en direct');
  const header = node('header');
  const headerCopy = node('div', 'header-copy');
  const title = node('h2', '', 'Ez-Kahoot');
  const subtitle = node('span', 'subtitle', 'Question en direct');
  headerCopy.append(title, subtitle);
  const reduce = button('icon-button', '−', 'Réduire Ez-Kahoot');
  reduce.setAttribute('aria-expanded', 'true');
  const close = button('icon-button', '×', 'Fermer Ez-Kahoot');
  header.append(node('span', 'logo', 'Ez'), headerCopy, reduce, close);
  const body = node('div', 'body');
  const quizLabel = node('p', 'quiz', hasQuiz(quiz) ? quiz.title || 'Quiz chargé' : 'Recherche du quiz…');
  const state = node('p', 'state');
  state.setAttribute('role', 'status');
  const question = node('p', 'question');
  const answers = node('ul', 'answers');
  answers.setAttribute('aria-label', 'Réponses du corrigé');
  const message = node('p', 'message');
  message.setAttribute('aria-live', 'polite');
  body.append(quizLabel, state, question, answers, message);
  const controls = node('div', 'controls');
  const autoLabel = node('label');
  const auto = document.createElement('input');
  auto.type = 'checkbox';
  auto.checked = initialAutoClick === true;
  autoLabel.append(auto, document.createTextNode('Auto-clic'));
  const answerOnce = button('answer-button', 'Répondre une fois');
  answerOnce.disabled = true;
  controls.append(autoLabel, answerOnce);
  const compactAnswer = node('p', 'compact-answer');
  compactAnswer.hidden = true;
  const footer = node('footer');
  const autoState = node('span', '', 'Auto-clic désactivé');
  footer.append(node('span', '', 'thomas marsa'), autoState);
  panel.append(header, body, controls, compactAnswer, footer);
  shadow.append(style, panel);
  document.documentElement.append(host);

  let currentQuiz = quiz;
  let discoveryMessage = 'Recherche du quiz…';
  let revealedAnswer = null;
  let lastMetadataRefresh = -Infinity;
  let metadataPending = false;
  let disposed = false;
  let debounce = null;
  let interval = null;
  let round = 0;
  let attemptedRound = false;
  let wasWaiting = true;
  let waitingSince = 0;
  let operation = null;
  let operationRound = -1;
  let viewKey = '';
  let latest = { capture: null, decision: { status: 'waiting', answers: [], targetIndexes: [] } };
  const blockedPage = capture => {
    let path = location.pathname;
    try { path = new URL(capture?.url || location.href, location.href).pathname; } catch { /* Use the current path. */ }
    return /\/(?:result|results|podium|lobby|ranking|leaderboard|scoreboard|summary|join|login)(?:\/|$)/i.test(path) ||
      ['result', 'results', 'podium', 'lobby', 'waiting', 'ranking', 'leaderboard'].includes(capture?.phase);
  };
  const resultPage = capture => {
    try { return /^(?:\/answer)?\/results?\/?$/i.test(new URL(capture?.url || location.href, location.href).pathname); } catch { return false; }
  };
  const roundNumber = value => {
    if (typeof value === 'number') return Number.isInteger(value) && value > 0 && value <= 10000 ? value : null;
    if (typeof value !== 'string') return null;
    const match = value.trim().replace(/\s+/g, ' ').match(/^(?:question\s+)?([1-9]\d{0,4})(?:\s*(?:\/|sur|of)\s*([1-9]\d{0,4}))?$/i);
    if (!match) return null;
    const current = Number(match[1]);
    const total = match[2] ? Number(match[2]) : null;
    return current <= 10000 && (total === null || (total <= 10000 && current <= total)) ? current : null;
  };
  const revealedMatches = (capture, value) => capture?.phase === 'result' && resultPage(capture) &&
    roundNumber(capture.roundId) !== null && roundNumber(capture.roundId) === roundNumber(value?.roundId);
  function inspect() {
    const capture = readPage() || {};
    if (revealedAnswer && !revealedMatches(capture, revealedAnswer)) revealedAnswer = null;
    if (revealedAnswer && resultPage(capture)) return {
      capture, definiteWaiting: true,
      decision: { status: 'revealed', question: revealedAnswer.question, answers: revealedAnswer.answers, targetIndexes: [], message: 'Correction reçue après la question.' }
    };
    if (!hasQuiz(currentQuiz)) return { capture, decision: { status: 'waiting', message: discoveryMessage, answers: [], targetIndexes: [] }, definiteWaiting: blockedPage(capture) };
    if (blockedPage(capture)) return { capture, decision: { status: 'waiting', message: 'En attente de la prochaine question.', answers: [], targetIndexes: [] }, definiteWaiting: true };
    const decision = decideAnswer(currentQuiz, capture) || {};
    return { capture, decision, definiteWaiting: false };
  }
  function render() {
    const { decision } = latest;
    const values = (Array.isArray(decision.answers) ? decision.answers : []).map(answer => String(typeof answer === 'string' ? answer : answer?.text || 'Réponse illustrée'));
    const ownOperation = operationRound === round ? operation : null;
    const labels = { ready: 'Réponse retrouvée', revealed: 'Question terminée', waiting: 'En attente', unknown: 'Corrigé indisponible', ambiguous: 'Question ambiguë', unmapped: 'Choix à vérifier', unsupported: 'Réponse à sélectionner', error: 'Lecture indisponible' };
    const activeState = ownOperation?.clicked ? 'Choix cliqué' : labels[decision.status] || 'En attente';
    const detail = ownOperation?.message || decision.message || '';
    const key = JSON.stringify([activeState, decision.question?.question || decision.question || '', values, detail, auto.checked, attemptedRound, document.hidden, revealedAnswer?.roundId || '']);
    if (key !== viewKey) {
      viewKey = key;
      state.textContent = activeState;
      state.dataset.state = decision.status || 'waiting';
      quizLabel.textContent = decision.status === 'revealed' ? `Question ${revealedAnswer.roundId} · correction de la partie` : hasQuiz(currentQuiz) ? currentQuiz.title || 'Quiz chargé' : 'Recherche du quiz…';
      question.textContent = typeof decision.question === 'string' ? decision.question : decision.question?.question || '';
      question.hidden = !question.textContent;
      answers.replaceChildren(...values.map(value => node('li', '', value)));
      answers.hidden = values.length === 0;
      message.textContent = detail;
      message.hidden = !detail;
      message.dataset.error = String(ownOperation?.clicked === false);
      compactAnswer.textContent = values.join(' · ') || activeState;
      autoState.textContent = auto.checked ? (document.hidden ? 'Auto-clic en pause' : 'Auto-clic activé') : 'Auto-clic désactivé';
      subtitle.textContent = decision.status === 'revealed' ? 'Correction après la question' : attemptedRound ? 'Une tentative pour cette question' : 'Question en direct';
    }
    answerOnce.disabled = decision.status !== 'ready' || attemptedRound || document.hidden;
  }
  function refresh() {
    if (disposed) return;
    try {
      latest = inspect();
      const waiting = latest.definiteWaiting || (!latest.capture.question && latest.decision.status === 'waiting');
      if (waiting) {
        if (!waitingSince) waitingSince = Date.now();
        if (!wasWaiting && (latest.definiteWaiting || Date.now() - waitingSince >= 150)) {
          round++;
          attemptedRound = false;
          operation = null;
          wasWaiting = true;
        }
      } else {
        waitingSince = 0;
        wasWaiting = false;
      }
      render();
      if (auto.checked && latest.decision.status === 'ready' && !attemptedRound && !document.hidden) void answer();
    } catch {
      latest = { capture: {}, decision: { status: 'error', message: 'Relis la question ou recharge le compagnon.', answers: [], targetIndexes: [] } };
      render();
    }
    if (typeof onRefresh === 'function' && !metadataPending && Date.now() - lastMetadataRefresh >= 1000) {
      lastMetadataRefresh = Date.now();
      metadataPending = true;
      const snapshot = { capture: latest.capture, quiz: currentQuiz };
      Promise.resolve().then(() => { if (!disposed) return onRefresh(snapshot); })
        .catch(() => { /* Discovery status is supplied by the caller; keep reading on transient errors. */ })
        .finally(() => { metadataPending = false; });
    }
  }
  async function answer() {
    if (disposed || attemptedRound || document.hidden) return;
    let fresh;
    try { fresh = inspect(); } catch { return refresh(); }
    if (fresh.decision.status !== 'ready' || fresh.decision.targetIndexes?.length !== 1 || blockedPage(fresh.capture)) {
      latest = fresh;
      render();
      return;
    }
    attemptedRound = true;
    const attemptRound = round;
    const signature = fresh.decision.signature;
    latest = fresh;
    operationRound = attemptRound;
    operation = { message: 'Clic en cours…' };
    render();
    try {
      const result = await activateAnswer(fresh.capture, fresh.decision.targetIndexes[0]);
      if (disposed || attemptRound !== round || (signature && latest.decision.signature && signature !== latest.decision.signature)) return;
      operation = { clicked: result?.clicked === true, message: result?.message || (result?.clicked ? 'Le choix correspondant a été cliqué.' : 'Le choix n’a pas pu être cliqué.') };
    } catch {
      if (disposed || attemptRound !== round) return;
      operation = { clicked: false, message: 'Clic indisponible. Choisis la réponse affichée.' };
    }
    render();
  }
  function schedule(records) {
    if (disposed || (records && records.every(record => record.target === host || shadow.contains(record.target) ||
      (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(item => item === host))))) return;
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(() => { debounce = null; refresh(); }, 70);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-hidden', 'aria-disabled', 'data-functional-selector'] });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (debounce !== null) clearTimeout(debounce);
    if (interval !== null) clearInterval(interval);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('pagehide', dispose);
    host.removeEventListener('ez-live-dispose', dispose);
    const restoreFocus = document.activeElement === host;
    host.remove();
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  close.addEventListener('click', dispose);
  host.addEventListener('ez-live-dispose', dispose, { once: true });
  window.addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('visibilitychange', refresh);
  auto.addEventListener('change', refresh);
  answerOnce.addEventListener('click', () => void answer());
  reduce.addEventListener('click', () => {
    const expanded = reduce.getAttribute('aria-expanded') !== 'true';
    reduce.setAttribute('aria-expanded', String(expanded));
    reduce.setAttribute('aria-label', expanded ? 'Réduire Ez-Kahoot' : 'Développer Ez-Kahoot');
    reduce.textContent = expanded ? '−' : '+';
    body.hidden = controls.hidden = !expanded;
    compactAnswer.hidden = expanded;
  });
  interval = setInterval(refresh, 500);
  refresh();
  return {
    host, dispose, refresh,
    setQuiz(nextQuiz) {
      if (disposed) return;
      currentQuiz = nextQuiz;
      quizLabel.textContent = hasQuiz(nextQuiz) ? nextQuiz.title || 'Quiz chargé' : 'Recherche du quiz…';
      refresh();
    },
    setDiscoveryStatus(value) {
      if (disposed) return;
      discoveryMessage = String(value || 'Recherche du quiz…').slice(0, 400);
      if (!hasQuiz(currentQuiz)) refresh();
    },
    setRevealedAnswer(value) {
      if (disposed) return;
      let capture;
      try { capture = readPage(); } catch { capture = null; }
      const valid = value?.phase === 'result' && typeof value.roundId === 'string' && /^[1-9]\d{0,4}$/.test(value.roundId) && revealedMatches(capture, value) &&
        Array.isArray(value.answers) && value.answers.length > 0 && value.answers.length <= 20 &&
        value.answers.every(answer => typeof answer?.text === 'string' && answer.text.trim());
      revealedAnswer = valid ? {
        phase: 'result', roundId: value.roundId,
        question: typeof value.question === 'string' ? value.question.slice(0, 1200) : '',
        answers: value.answers.map(answer => ({ text: answer.text.slice(0, 1200) }))
      } : null;
      refresh();
    }
  };
}
