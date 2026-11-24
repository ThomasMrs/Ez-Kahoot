/* Generated passive receiver */
(() => {
// Decode quiz markup as text only: no DOM parsing, resource load or script execution.
function plainQuizText(value, limit = 1200) {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    times: '×', divide: '÷', minus: '−', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', deg: '°', sup1: '¹', sup2: '²', sup3: '³',
    eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ugrave: 'ù', ucirc: 'û', ocirc: 'ô', icirc: 'î', iuml: 'ï', oelig: 'œ',
    Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', Ugrave: 'Ù', Ucirc: 'Û', Ocirc: 'Ô', Icirc: 'Î', Iuml: 'Ï', OElig: 'Œ' };
  return value.slice(0, 20_000)
    .replace(/<!--(?:[\s\S]*?-->|[\s\S]*$)/g, '')
    .replace(/<(script|style|template|noscript)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<sup(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?>([\s\S]*?)<\/sup\s*>/gi, '^($1)')
    .replace(/<sub(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?>([\s\S]*?)<\/sub\s*>/gi, '_($1)')
    .replace(/<\/?(?:br|p|div|li|ul|ol|h[1-6]|blockquote|section|article|table|tr|td|th|hr)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi, ' ')
    .replace(/<\/?(?:a|abbr|b|bdi|bdo|cite|code|del|dfn|em|i|img|ins|kbd|mark|q|s|samp|small|span|strike|strong|sub|sup|time|u|var|wbr)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity, key) => {
      if (key[0] !== '#') return entities[key] ?? entities[key.toLowerCase()] ?? entity;
      const hex = key[1]?.toLowerCase() === 'x';
      const number = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ' ';
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}


// Parse only quiz fields in received JSON. No raw frames, identity or credentials survive.
function parseReceivedQuiz(raw, previous = null) {
  if (typeof raw !== 'string' || raw.length > 512 * 1024) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const queue = Array.isArray(parsed) ? parsed.slice(0, 50) : [parsed];
  let result = null;
  for (let i = 0; i < queue.length && i < 100; i++) {
    const value = queue[i];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const name of ['data', 'content', 'gameBlockData']) {
      let nested = value[name];
      if (typeof nested === 'string' && nested.length <= 512 * 1024) {
        try { nested = JSON.parse(nested); } catch { continue; }
      }
      if (nested && typeof nested === 'object' && !Array.isArray(nested) && queue.length < 100) queue.push(nested);
    }
    const index = value.questionIndex ?? value.questionNumber;
    const roundId = Number.isInteger(index) && index >= 0 && index < 500 ? String(index + 1) : null;
    const rawQuestion = typeof value.question === 'object' && value.question ? value.question : value;
    const question = plainQuizText(typeof value.question === 'string' ? value.question : rawQuestion.title ?? value.gameBlockTitle);
    const rawChoices = rawQuestion.choices ?? rawQuestion.options;
    const choices = Array.isArray(rawChoices) && rawChoices.length >= 2 && rawChoices.length <= 20
      ? rawChoices.map(c => plainQuizText(typeof c === 'string' ? c : c?.text ?? c?.answer)) : [];
    if (roundId && question && question.length <= 1200 && choices.length >= 2 &&
        choices.every(c => c && c.length <= 2000) && choices.join('').length <= 8000) {
      result = { ...result, observedQuestion: { question, choices, roundId } };
    }
    const observed = result?.observedQuestion || previous?.observedQuestion;
    const correct = value.correctChoices ?? value.result?.correctChoices;
    // A result without an explicit round is never attached to the previous question.
    if (roundId && observed?.roundId === roundId && Array.isArray(correct) && correct.length > 0 &&
        correct.length <= 20 && correct.every(n => Number.isInteger(n) && n >= 0 && n < observed.choices.length)) {
      result = { ...result, observedQuestion: observed, revealedAnswer: { phase: 'result', roundId,
        question: observed.question, answers: [...new Set(correct)].map(n => ({ text: observed.choices[n] })) } };
    }
    const id = value.quizId ?? value.kahootId;
    if (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      result = { ...result, quizId: id.toLowerCase() };
    }
    const count = value.numGameBlocks ?? value.questionCount;
    if (Number.isInteger(count) && count > 0 && count <= 500) result = { ...result, questionCount: count };
  }
  return result;
}


function installQuizReceiver() {
  if (globalThis.__ezKahootReceiverInstalled || typeof WebSocket !== 'function') return;
  globalThis.__ezKahootReceiverInstalled = true;
  const NativeSocket = WebSocket;
  let frames = 0, accepted = 0, snapshot = null;
  globalThis.WebSocket = new Proxy(NativeSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget);
      let url;
      try { url = new URL(String(args[0]), location.href); } catch { return socket; }
      if (url.protocol !== 'wss:' || !(url.hostname === 'kahoot.it' || url.hostname.endsWith('.kahoot.it'))) return socket;
      socket.addEventListener('message', event => {
        frames++;
        const now = Date.now();
        if (globalThis.__ezKahootNetworkV1?.snapshot === null) snapshot = null;
        // Keep bounded correlation context for long questions. Discovery still
        // limits display freshness to 30 seconds and gates results by route.
        if (snapshot && (now - snapshot.updatedAt > 15 * 60_000 || /\/(?:join|lobby)(?:\/|$)/.test(location.pathname))) snapshot = null;
        let next = parseReceivedQuiz(event.data, snapshot);
        if (next?.quizId && snapshot?.quizId && next.quizId !== snapshot.quizId) {
          snapshot = null;
          next = parseReceivedQuiz(event.data, null);
        }
        if (next) {
          accepted++;
          // Metadata updates preserve context without making old text fresh.
          const updatedAt = next.observedQuestion || !snapshot ? now : snapshot.updatedAt;
          snapshot = { ...snapshot, ...next, updatedAt };
          if (next.observedQuestion && !next.revealedAnswer) delete snapshot.revealedAnswer;
        }
        globalThis.__ezKahootNetworkV1 = { snapshot, frames: Math.min(frames, 1e6), accepted: Math.min(accepted, 1e6) };
      });
      return socket;
    }
  });
}

installQuizReceiver();
})();
