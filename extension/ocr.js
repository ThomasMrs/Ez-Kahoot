export async function imageFromFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Choisis une image PNG, JPEG ou WebP de moins de 10 Mo.');
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); return imageFromFrame(bitmap, bitmap.width, bitmap.height); }
  catch { throw new Error('Cette image ne peut pas être lue.'); }
  finally { bitmap?.close(); }
}

export function imageFromFrame(frame, width, height) {
  if (!width || !height || width * height > 40_000_000) throw new Error('Image trop grande ou vide. Limite : 40 mégapixels.');
  const scale = Math.min(1, Math.sqrt(4_000_000 / (width * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export async function captureScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Capture indisponible ici. Utilise une image enregistrée.');
  let stream;
  const video = document.createElement('video');
  let timer;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    video.srcObject = stream; video.muted = true;
    await Promise.race([video.play(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Capture trop longue. Réessaie.')), 10000); })]);
    return imageFromFrame(video, video.videoWidth, video.videoHeight);
  } finally {
    clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
}

export function recognizeImage(image, { signal, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Lecture annulée.'));
    const worker = new Worker(chrome.runtime.getURL('ocr-runner.js'));
    const finish = (error, value) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new Error('Lecture annulée.'));
    const timer = setTimeout(() => finish(new Error('Lecture trop longue. Recadre une image plus petite.')), 60000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('Le moteur OCR local n’a pas démarré. Recharge l’extension complète.'));
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data);
      else if (data.type === 'result') finish(null, data.text);
      else if (data.type === 'error') finish(new Error('Lecture OCR impossible. Essaie une image plus nette.'));
    };
    worker.postMessage({ image });
  });
}
