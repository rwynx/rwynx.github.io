// dedicated Web Worker for background removal — runs on its own real OS thread, completely separate
// from the page's main thread. this is the actual fix for the freeze: we stopped relying on the
// library's own internal worker spawning (e.g. imgly's proxyToWorker config option), which wasn't
// succeeding when loaded from a CDN instead of a real bundler. instead we spin up a plain, standard
// module Worker ourselves and do the heavy lifting inside it. the main thread stays completely free
// the whole time — cursor, clicks, and any CSS/JS-driven UI (including a normal, honestly-real
// progress bar) keep working exactly as normal.
//
// TESTING: swapped @imgly/background-removal (ISNet-based) for BRIA AI's RMBG-1.4, run through
// huggingface's transformers.js as a 'background-removal' pipeline. RMBG-1.4 handles busy/complex
// images (hair, semi-transparent edges, multiple objects) noticeably better than imgly's default
// model did — that one kept losing detail on anything past a simple single-subject shot.
//
// license note: RMBG-1.4 weights are CC BY-NC 4.0 (non-commercial use only) — fine here since this
// site is explicitly non-commercial. model loads from the HF hub CDN the first time (int8 quantized,
// ~44MB) and the browser caches it after that via the Cache Storage API, same as imgly did before.

self.onmessage = async (e) => {
  const { file } = e.data;
  try {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');

    const segmenter = await pipeline('background-removal', 'briaai/RMBG-1.4', {
      dtype: 'q8', // int8 quantized weights, ~44MB — swap to 'fp16' (~88MB) later if accuracy needs it
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          self.postMessage({ type: 'progress', key: p.file || 'model', current: p.loaded, total: p.total });
        }
      }
    });

    const objectUrl = URL.createObjectURL(file);
    const output = await segmenter(objectUrl);
    URL.revokeObjectURL(objectUrl);

    const result = Array.isArray(output) ? output[0] : output;
    const blob = await result.toBlob();

    self.postMessage({ type: 'done', blob });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
