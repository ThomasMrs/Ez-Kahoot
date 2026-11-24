// This outer worker makes cancellation possible even during engine initialization.
importScripts('vendor/ocr/tesseract.min.js');
self.onmessage = async ({ data }) => {
  let worker;
  try {
    const base = new URL('vendor/ocr/', self.location.href).href;
    worker = await Tesseract.createWorker(['fra', 'eng'], 1, {
      workerPath: base + 'worker.min.js', corePath: base, langPath: base,
      workerBlobURL: false, gzip: true, cacheMethod: 'none',
      logger: info => self.postMessage({ type: 'progress', progress: info.progress, status: info.status }),
      errorHandler: () => self.postMessage({ type: 'error' })
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const result = await worker.recognize(data.image);
    self.postMessage({ type: 'result', text: result.data.text.slice(0, 12000) });
  } catch { self.postMessage({ type: 'error' }); }
  finally { if (worker) await worker.terminate(); }
};
