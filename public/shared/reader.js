(() => {
  const visible = element => {
    if (!element || !element.getClientRects().length || element.closest('[aria-hidden="true"]')) return false;
    if (typeof element.checkVisibility === 'function') {
      try {
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      } catch { /* Use the ancestor checks below in browsers with older implementations. */ }
    }
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.inert || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return true;
  };
  const text = element => {
    if (!element) return '';
    // innerText flattens superscripts (5<sup>2</sup> becomes 52).
    // Preserve their meaning while reading only rendered descendants.
    const scriptedText = node => {
      if (node.nodeType === 3) return node.textContent || '';
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName)) return '';
      const style = getComputedStyle(node);
      if (node.hidden || node.inert || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return '';
      const content = [...node.childNodes].map(scriptedText).join('');
      if (node.tagName === 'SUP') return ` ^(${content}) `;
      if (node.tagName === 'SUB') return ` _(${content}) `;
      return /^(BR|P|DIV|LI|H[1-6])$/.test(node.tagName) ? ` ${content} ` : content;
    };
    const value = element.querySelector('sup, sub') ? scriptedText(element) : element.innerText;
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  };
  const validText = (value, explicit = false) => value.length >= (explicit ? 2 : 8) && value.length <= 1200 &&
    (explicit ? /[\p{L}\p{N}]/u.test(value) : /\p{L}/u.test(value)) &&
    !/^(kahoot!?|game pin\b|pin\s*:|waiting\b|loading\b|you.re in\b|get ready\b|ready to join\b|en attente\b|chargement\b|classement\s*$|r[ée]sultats\s*$|c.est parti\s*!?\s*$|question\s+\d+\s*((?:of|sur)\s+\d+)?\s*$)/i.test(value);
  const selectors = ['[data-functional-selector="question-title"]', '[data-functional-selector="question-text"]', '[data-functional-selector="question"]', '[data-testid="question-title"]', '.question-title', '.question-text'];
  const resultPage = /\/(?:result|results|podium|ranking|scoreboard|lobby|join)(?:\/|$)/i.test(location.pathname);
  const roundElement = document.querySelector('[data-functional-selector="question-index-counter"]');
  let roundId = roundElement && visible(roundElement) ? text(roundElement) : '';
  if (!roundId) {
    const counters = new Map();
    let scanned = 0;
    for (const span of document.querySelectorAll('span')) {
      if (scanned++ >= 500) break;
      if (!visible(span)) continue;
      const value = text(span);
      const match = value.match(/^question\s+([1-9]\d{0,4})\s+(?:sur|of)\s+([1-9]\d{0,4})$/i);
      if (!match) continue;
      const current = Number(match[1]);
      const total = Number(match[2]);
      if (current > total || total > 10000) continue;
      counters.set(`${current}/${total}`, value);
      if (counters.size > 1) break;
    }
    if (counters.size === 1) roundId = [...counters.values()][0];
  }
  let question = '';
  let method = 'none';
  for (const selector of resultPage ? [] : selectors) {
    const found = [...document.querySelectorAll(selector)].find(element => visible(element) && validText(text(element), true));
    if (found) { question = text(found); method = 'selector'; break; }
  }
  if (!question && !resultPage) {
    const found = [...document.querySelectorAll('main h1, main h2, [role="main"] h1, [role="main"] h2, h1, h2')]
      .find(element => visible(element) && !element.closest('nav,footer') && validText(text(element)));
    if (found) { question = text(found); method = 'heading'; }
  }
  const choices = [];
  const seen = new Set();
  const choiceSelectors = ['button[data-functional-selector^="answer-"]', '[data-functional-selector^="answer-option-"]', '[data-functional-selector^="answer-button-"]', '[data-testid^="answer-option-"]', '.answer-option', '.answer-button'];
  for (const selector of resultPage ? [] : choiceSelectors) {
    const elements = [...document.querySelectorAll(selector)];
    for (const [elementIndex, element] of elements.entries()) {
      if (!visible(element)) continue;
      const value = text(element);
      if (!value || !/[\p{L}\p{N}]/u.test(value) || /^(triangle|circle|square|diamond|red|blue|yellow|green)$/i.test(value)) continue;
      if (seen.has(element)) continue;
      seen.add(element);
      const button = element.closest('button,[role="button"]') || element;
      choices.push({ text: value, index: choices.length, selector, elementIndex,
        disabled: !!button.disabled || button.getAttribute('aria-disabled') === 'true' });
      if (choices.length >= 20) break;
    }
    if (choices.length) break;
  }
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const allowed = new Set(['kahoot.it', 'create.kahoot.it', 'play.kahoot.it']);
  const idFromUrl = value => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || !allowed.has(url.hostname)) return null;
      return decodeURIComponent(url.href).match(uuid)?.[0]?.toLowerCase() || null;
    } catch { return null; }
  };
  let quizId = idFromUrl(location.href);
  if (!quizId) {
    for (const value of [document.querySelector('link[rel="canonical"]')?.href, document.querySelector('meta[property="og:url"]')?.content]) {
      quizId = idFromUrl(value);
      if (quizId) break;
    }
  }
  if (!quizId) {
    const ids = new Set([...document.querySelectorAll('a[href]')].filter(visible)
      .map(anchor => /\/(details|share)\//.test(anchor.href) ? idFromUrl(anchor.href) : null).filter(Boolean));
    if (ids.size === 1) quizId = [...ids][0];
  }
  const phase = resultPage ? 'result' : question ? 'question' : 'waiting';
  return { url: `${location.origin}${location.pathname}`, title: document.title.slice(0, 300), quizId, question, choices, method,
    roundId, phase, canAnswer: phase === 'question' && choices.some(choice => !choice.disabled) };
})()
