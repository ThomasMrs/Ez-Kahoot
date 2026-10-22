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
    :host{all:initial;font:13px/1.5 Montserrat,Arial,sans-serif;color:#25076b;color-scheme:light}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}
    button:focus-visible,input:focus-visible{outline:3px solid #ffdf00;outline-offset:3px;box-shadow:0 0 0 2px #25076b}
    .panel{background:#fff;border:1px solid #d6c6f0;border-radius:12px;box-shadow:0 8px 32px #25076b29;overflow:hidden}
    header{display:flex;align-items:center;gap:9px;padding:11px 12px;background:#46178f;color:#fff}
    .logo{display:grid;place-items:center;flex:none;width:28px;height:28px}.logo svg{display:block;width:100%;height:100%}
    h2{display:flex;align-items:center;font-size:22px;letter-spacing:-.055em;margin:0;line-height:1.15;font-weight:900}.wordmark{display:block;width:119px;height:31px}.subtitle{display:block;font-size:9px;color:#e8dcfa;margin-top:2px}
    .header-copy{flex:1;min-width:0}.icon-button{display:grid;place-items:center;flex:none;width:30px;height:30px;border:1px solid #9470c2;border-radius:6px;background:transparent;color:#fff;font-size:19px;line-height:1}
    .icon-button:hover{background:#25076b}.body{padding:13px 14px;max-height:min(520px,calc(100vh - 140px));overflow:auto}
    .quiz{font-size:10px;color:#645675;margin:0 0 10px;overflow-wrap:anywhere}.state{display:inline-flex;gap:6px;align-items:center;font-size:10px;font-weight:700;color:#645675;margin:0 0 9px}
    .state::before{content:'';width:6px;height:6px;flex:none;border-radius:50%;background:#8c77a4}.state[data-state=ready],.state[data-state=revealed]{color:#1f650a}.state[data-state=ready]::before,.state[data-state=revealed]::before{background:#36851f}
    .state[data-state=ambiguous],.state[data-state=unmapped],.state[data-state=unsupported]{color:#7a4200}.state[data-state=error]{color:#9f1332}
    .question{font-size:11px;font-weight:600;line-height:1.55;margin:0 0 10px;overflow-wrap:anywhere}.answers{display:grid;gap:6px;list-style:none;padding:0;margin:0}
    .answers li{background:#e7f6df;border:1px solid #b7d7aa;border-radius:7px;padding:10px 11px;color:#1f650a;font-size:13px;font-weight:700;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
    .message{font-size:10px;line-height:1.65;color:#645675;margin:10px 0 0;overflow-wrap:anywhere}.message[data-error=true]{color:#9f1332}
    .controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border-top:1px solid #e5dcf2}
    label{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;cursor:pointer}input{accent-color:#46178f;margin:0;width:15px;height:15px}
    .answer-button{border:1px solid #46178f;border-radius:6px;background:#46178f;color:#fff;padding:7px 10px;font-size:10px;font-weight:700;min-height:32px}.answer-button:hover:not(:disabled){background:#25076b}
    footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;background:#f1eafb;border-top:1px solid #e5dcf2;font-size:9px;color:#5f4b78}
    .compact-answer{padding:10px 12px;font-size:12px;font-weight:700;line-height:1.5;color:#1f650a;margin:0;max-height:80px;overflow:auto;overflow-wrap:anywhere}
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
  const logo = node('span', 'logo');
  logo.setAttribute('aria-hidden', 'true');
  logo.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 34" focusable="false"><path d="M0,3.12411067 L5.3201581,1.75968379 L5.30711462,12.5774704 L14.2901186,3.91304348 L18.9106719,5.68853755 L12.3814229,12.9316206 L16.7118577,28.7075099 L12.013834,28.7075099 L8.5486166,16.6209486 L5.27588933,19.8256917 L5.3201581,28.7075099 L0,28.5173913 L0,3.12411067 Z" fill="#fff"/><path d="M27 1 20 18h7l-5 15 14-22h-8l5-10Z" fill="#ffcc00"/></svg>';
  header.append(logo, headerCopy, reduce, close);
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
