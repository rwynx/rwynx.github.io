// dedicated Web Worker for background removal — runs on its own real OS thread, completely separate
// from the page's main thread. this is the actual fix for the freeze: we stopped relying on the
// library's own internal worker spawning (e.g. imgly's proxyToWorker config option), which wasn't
// succeeding when loaded from a CDN instead of a real bundler. instead we spin up a plain, standard
// module Worker ourselves and do the heavy lifting inside it. the main thread stays completely free
// the whole time — cursor, clicks, and any CSS/JS-driven UI (including a normal, honestly-real
// progress bar) keep working exactly as normal.
//
// swapped @imgly/background-removal (ISNet-based) for BRIA AI's RMBG-1.4, run through huggingface's
// transformers.js as a 'background-removal' pipeline. RMBG-1.4 handles busy/complex images (hair,
// semi-transparent edges, multiple objects) noticeably better than imgly's default model did.
//
// license note: RMBG-1.4 weights are CC BY-NC 4.0 (non-commercial use only) — fine here since this
// site is explicitly non-commercial. model loads from the HF hub CDN the first time, browser caches
// it after that via the Cache Storage API, same as imgly did before.
//
// dtype now comes from the page (quality selector: q8 ~44MB / fp16 ~88MB / fp32 ~176MB) instead of
// being hardcoded. each dtype gets its own cached pipeline instance in self._segmenters, so switching
// between quality levels mid-session doesn't re-trigger a download for one you already fetched.

self.onmessage = async (e) => {
  const { file, dtype } = e.data;
  const chosenDtype = dtype || 'q8';
  try {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');

    if (!self._segmenters) self._segmenters = {};
    if (!self._segmenters[chosenDtype]) {
      self._segmenters[chosenDtype] = pipeline('background-removal', 'briaai/RMBG-1.4', {
        dtype: chosenDtype,
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            self.postMessage({ type: 'progress', key: p.file || 'model', current: p.loaded, total: p.total });
          }
        }
      });
    }
    const segmenter = await self._segmenters[chosenDtype];

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
