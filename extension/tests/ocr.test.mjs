import test from 'node:test';
import assert from 'node:assert/strict';
import { captureScreen, imageFromFrame, imageFromFile, recognizeImage } from '../ocr.js';

test('screen capture requests no audio and stops all tracks after its single frame, including failures', async () => {
  let stopped = 0, request, failed = false;
  const video = { videoWidth: 1920, videoHeight: 1080, play: async () => { if (failed) throw new Error('failed'); } };
  globalThis.document = { createElement: tag => tag === 'video' ? video : {
    getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/png;base64,fixture'
  } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getDisplayMedia: async options => { request = options; return { getTracks: () => [{ stop() { stopped++; } }, { stop() { stopped++; } }] }; }
  } } });
  assert.match(await captureScreen(), /^data:image\/png/);
  assert.equal(request.audio, false); assert.equal(stopped, 2); assert.equal(video.srcObject, null);
  failed = true; await assert.rejects(captureScreen()); assert.equal(stopped, 4); assert.equal(video.srcObject, null);
  assert.throws(() => imageFromFrame({}, 10000, 10000));
  await assert.rejects(imageFromFile({ type: 'image/svg+xml', size: 1 }));
  await assert.rejects(imageFromFile({ type: 'image/png', size: 11 * 1024 * 1024 }));
});

test('OCR cancellation terminates the isolated worker during initialization', async () => {
  let terminated = 0, posted;
  globalThis.chrome = { runtime: { getURL: name => 'chrome-extension://test/' + name } };
  globalThis.Worker = class { constructor(url) { assert.match(url, /ocr-runner\.js$/); } postMessage(value) { posted = value; } terminate() { terminated++; } };
  const controller = new AbortController();
  const pending = recognizeImage('data:image/png;base64,fixture', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /annulée/);
  assert.equal(terminated, 1); assert.equal(posted.image, 'data:image/png;base64,fixture');
});
