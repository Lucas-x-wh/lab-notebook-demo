// Browser-only OCR. Images stay on this device; CDN requests download code/models.
let ocrLibraryPromise;
function loadOCRLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!ocrLibraryPromise) ocrLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(Error('识别组件下载超时')); }, 30000);
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
    script.onload = () => { clearTimeout(timer); window.Tesseract ? resolve(window.Tesseract) : reject(Error('识别组件加载失败')); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('无法下载识别组件')); };
    document.head.append(script);
  }).catch(error => { ocrLibraryPromise = null; throw error; });
  return ocrLibraryPromise;
}
async function recognizeInBrowser(data, progress = () => {}) {
  let worker, expired = false, timer;
  const work = async () => {
    progress('首次使用需下载识别组件和中英文模型，请稍候…');
    const engine = await loadOCRLibrary();
    if (expired) throw Error('识别超时');
    worker = await engine.createWorker('chi_sim+eng', 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
      logger: message => {
        if (expired) return;
        if (message.status === 'recognizing text') progress('正在识别文字 · ' + Math.round(message.progress * 100) + '%');
      }
    });
    if (expired) { await worker.terminate(); throw Error('识别超时'); }
    const result = await worker.recognize(data);
    return result.data.text;
  };
  try {
    return await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(Error('识别超时，请尝试裁剪图片或直接粘贴文字')); }, 180000);
    })]);
  } finally {
    expired = true;
    clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => {});
  }
}
