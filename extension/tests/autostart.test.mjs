import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../autostart.js', import.meta.url), 'utf8');
async function setup(preferences = {}, deferred = false) {
  let listener, pagehide, resolve, panel = null;
  const starts = [], removals = [];
  const context = vm.createContext({ Event,
    document: { getElementById: () => panel },
    window: { addEventListener: (_, callback) => { pagehide = callback; } },
    chrome: { storage: {
      local: { get: () => deferred ? new Promise(done => { resolve = done; }) : Promise.resolve(preferences) },
      onChanged: { addListener: callback => { listener = callback; }, removeListener: callback => removals.push(callback) }
    } },
    __ezKahootStart: (quiz, options) => {
      starts.push({ quiz, ...options });
      panel = { dispatchEvent(event) { assert.equal(event.type, 'ez-live-dispose'); panel = null; } };
    }
  });
  vm.runInContext(source, context);
  await Promise.resolve();
  return { starts, removals, context, listener, pagehide, resolve, close: () => { panel = null; }, hasPanel: () => !!panel };
}

test('fresh install starts the autonomous panel exactly once without a server', async () => {
  const state = await setup();
  assert.deepEqual(state.starts, [{ quiz: null, publicOnly: true }]);
  vm.runInContext(source, state.context);
  assert.equal(state.starts.length, 1);
  state.close();
  await Promise.resolve();
  assert.equal(state.starts.length, 1, 'closing is respected until a reload or explicit re-enable');
});

test('disabled startup stays quiet and changing the setting updates the page', async () => {
  const state = await setup({ ezkAutoStart: false });
  assert.equal(state.starts.length, 0);
  state.listener({ ezkAutoStart: { newValue: true } }, 'sync');
  assert.equal(state.starts.length, 0);
  state.listener({ ezkAutoStart: { newValue: true } }, 'local');
  assert.equal(state.hasPanel(), true);
  state.listener({ ezkAutoStart: { newValue: false } }, 'local');
  assert.equal(state.hasPanel(), false);
});

test('a late initial preference cannot override a newer change or page teardown', async () => {
  const state = await setup({}, true);
  state.listener({ ezkAutoStart: { newValue: false } }, 'local');
  state.resolve({});
  await Promise.resolve();
  assert.equal(state.starts.length, 0);
  state.pagehide();
  state.listener({ ezkAutoStart: { newValue: true } }, 'local');
  assert.equal(state.starts.length, 0);
  assert.equal(state.removals.length, 1);
});
