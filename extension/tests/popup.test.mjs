import assert from 'node:assert/strict';
const quizId = '77c46705-dab1-4ca1-a435-c287194db522';
const token = 'test_token_12345678901234567890';
const fixtureConnection = { baseUrl: 'http://127.0.0.1:8765', token };
const quiz = { id: quizId, title: 'Quiz de test', questions: [{ question: 'Que vaut 2+2 ?', choices: [{ text: '4', correct: true }] }] };
const codeFor = connection => 'EZK1.' + Buffer.from(JSON.stringify(connection)).toString('base64url');
async function setup({ name, probeId = null, questionCount = null, initialStatus = 200, url = 'https://kahoot.it/answer/result', saved = true, pairStatus = 200, pairPayload = null } = {}) {
  const nodes = new Map();
  function get(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      disabled: false, hidden: false, open: false, value: '', className: '', textContent: '', innerHTML: '', handlers: {},
      classList: { toggle() {} },
      addEventListener(event, callback) { this.handlers[event] = callback; },
      setAttribute(key, value) { this[key] = value; }, focus() {}
    });
    return nodes.get(selector);
  }
  globalThis.document = { querySelector: get, body: get('body') };
  const capture = { question: 'Que vaut 2+2 ?', choices: [{ text: '4', index: 0 }], quizId: null, method: 'selector' };
  const state = { calls: [], fetches: [], writes: [], removes: [], get, quizStatus: initialStatus, started: undefined, opened: [] };
  globalThis.__ezKahootStart = prepared => { state.started = prepared; state.calls.push('started'); };
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 42, url }], create: value => state.opened.push(value) },
    storage: { local: { get: async () => saved ? { ezkConnection: fixtureConnection } : {}, set: async value => state.writes.push(value), remove: async value => state.removes.push(value) } },
    scripting: { executeScript: async payload => {
      state.calls.push(payload);
      if (payload.files?.[0] === 'reader.js') return [{ result: capture }];
      if (payload.files?.[0] === 'probe-runtime.js') { assert.equal(payload.world, 'MAIN'); return [{ result: { quizId: probeId, questionCount } }]; }
      if (payload.files?.[0] === 'live-runtime.js') return [{}];
      return [{ result: payload.func(...payload.args) }];
    } }
  };
  globalThis.fetch = async (requestUrl, options) => {
    state.fetches.push({ url: requestUrl, options });
    if (requestUrl.endsWith('/api/companion/pair')) return { ok: pairStatus === 200, status: pairStatus, json: async () => pairPayload || { connectionCode: codeFor(fixtureConnection) } };
    const status = requestUrl.endsWith('/health') ? 200 : state.quizStatus;
    return { ok: status === 200, status, json: async () => requestUrl.endsWith('/health') ? { name: 'Ez-Kahoot' } : status === 200 ? quiz : { error: status === 404 ? 'Aucun quiz envoyé.' : 'Code expiré.' } };
  };
  const popupUrl = new URL('../popup.js', import.meta.url);
  popupUrl.searchParams.set('scenario', name);
  await import(popupUrl.href);
  await new Promise(resolve => setTimeout(resolve, 0));
  return state;
}
const click = (state, selector) => state.get(selector).handlers.click();
let state = await setup({ name: 'prepared' });
assert.equal(state.get('#open-live').disabled, false);
assert.equal(state.get('#quiz-origin').textContent, 'QUIZ PRÉPARÉ');
assert.equal(state.get('#quick-connect').hidden, true);
assert.equal(state.get('#settings-details').open, false);
await click(state, '#open-live');
assert.deepEqual(state.started, quiz);
assert.deepEqual(state.calls.slice(0,3).map(call => call.files[0]), ['reader.js', 'probe-runtime.js', 'live-runtime.js']);
assert.deepEqual(state.calls[3].args, [quiz]);
assert.match(state.get('#capture-status').textContent, /Panneau lancé/);
state = await setup({ name: 'missing', initialStatus: 404 });
await click(state, '#open-live');
assert.equal(state.started, null);
assert.deepEqual(state.calls[3].args, [null]);
assert.match(state.get('#capture-status').textContent, /Détection automatique/);
state = await setup({ name: 'detected', probeId: quizId });
await click(state, '#open-live');
assert.deepEqual(state.started, quiz);
assert.equal(state.get('#quiz-origin').textContent, 'QUIZ DÉTECTÉ');
assert.ok(state.fetches.some(request => request.url.endsWith(`/bridge/quiz?input=${quizId}`)));
state = await setup({ name: 'wrongCount', questionCount: 16 });
await click(state, '#open-live');
assert.equal(state.started, null);
state = await setup({ name: 'auth' });
state.quizStatus = 401;
await click(state, '#open-live');
assert.equal(state.started, undefined);
assert.ok(!state.calls.some(call => call.files?.[0] === 'live-runtime.js'));
assert.equal(state.get('#open-live').disabled, true);
assert.match(state.get('#capture-status').textContent, /Code expiré/);
state = await setup({ name: 'restricted', url: 'https://example.com/' });
await click(state, '#open-live');
assert.equal(state.calls.length, 0);
assert.equal(state.started, undefined);
assert.match(state.get('#capture-status').textContent, /Ouvre un onglet Kahoot/);
state = await setup({ name: 'newPair', saved: false });
assert.equal(state.fetches.length, 0, 'No fresh connection request before a user click');
assert.equal(state.get('#open-live').disabled, true);
await click(state, '#quick-pair');
assert.equal(state.get('#open-live').disabled, false);
assert.equal(state.get('#quick-connect').hidden, true);
assert.equal(state.writes.length, 1);
assert.deepEqual(state.writes[0], { ezkConnection: fixtureConnection });
const request = state.fetches[0];
assert.equal(request.url, 'http://127.0.0.1:8765/api/companion/pair');
assert.equal(request.options.method, 'POST');
assert.equal(request.options.body, '{}');
assert.equal(request.options.headers['Content-Type'], 'application/json');
assert.equal(request.options.credentials, 'omit');
assert.ok(!Object.hasOwn(request.options.headers, 'Origin'));
assert.equal(state.get('#settings-details').open, false);
assert.equal(state.get('#quiz-title').textContent, quiz.title);
await click(state, '#forget');
assert.deepEqual(state.removes, ['ezkConnection']);
assert.equal(state.get('#open-live').disabled, true);
assert.equal(state.get('#quick-connect').hidden, false);
assert.equal(state.get('#quiz-title').textContent, 'Quiz pas encore reçu');
state = await setup({ name: 'newPairNoQuiz', saved: false, initialStatus: 404 });
await click(state, '#quick-pair');
assert.equal(state.get('#open-live').disabled, false);
assert.equal(state.get('#quiz-title').textContent, 'Quiz pas encore reçu');
await click(state, '#open-live');
assert.equal(state.started, null);
state = await setup({ name: 'pairUnavailable', saved: false, pairStatus: 403 });
await click(state, '#quick-pair');
assert.equal(state.get('#settings-details').open, true);
assert.equal(state.get('#open-live').disabled, true);
assert.equal(state.writes.length, 0);
assert.match(state.get('#capture-status').textContent, /Connexion avancée/);
const custom = { ...fixtureConnection, baseUrl: 'http://127.0.0.1:8766' };
state.get('#connection-code').value = codeFor(custom);
await state.get('#connect-form').handlers.submit({ preventDefault() {} });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(state.get('#open-live').disabled, false);
assert.equal(state.get('#settings-details').open, false);
assert.deepEqual(state.writes[0], { ezkConnection: custom });
assert.ok(state.fetches.some(request => request.url === 'http://127.0.0.1:8766/bridge/health'));
await click(state, '#open-panel');
assert.deepEqual(state.opened[0], { url: 'http://127.0.0.1:8766/#companion' });
console.log('PASS: popup compact, lancement préparé/détecté/sans quiz, contrôle nombre de questions, refus auth/hôte, connexion rapide au clic, absence d’appairage automatique, déconnexion et code port personnalisé.');
