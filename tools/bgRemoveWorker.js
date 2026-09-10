// dedicated Web Worker for background removal — runs on its own real OS thread, completely separate
// from the page's main thread. this is the actual fix for the freeze: we stopped relying on the
// library's own internal worker spawning (e.g. imgly's proxyToWorker config option), which wasn't
// succeeding when loaded from a CDN instead of a real bundler. instead we spin up a plain, standard
// module Worker ourselves and do the heavy lifting inside it. the main thread stays completely free
// the whole time — cursor, clicks, and any CSS/JS-driven UI (including a normal, honestly-real
// progress bar) keep working exactly as normal.
//
// runs BRIA AI's RMBG-1.4 (CC BY-NC 4.0, non-commercial — fine for this site) through the
// 'background-removal' pipeline, which hands back a ready-made RGBA cutout directly.
//
// TRIED AND ABANDONED: a 'heavy' tier using BiRefNet for genuinely harder/complex images. three
// separate attempts all failed for different reasons — ZhengPeng7/BiRefNet isn't packaged for
// transformers.js (needs PyTorch's trust_remote_code, missing preprocessor_config.json), briaai/
// RMBG-2.0 (same BiRefNet architecture) has a known unresolved OOM/config bug in its background-
// removal pipeline, and the community mirror ajartivo/aj-pixel-cut turned out to be gated/private,
// not actually anonymously fetchable. the BiRefNet family just isn't in a stable, publicly-
// accessible state for browser use via transformers.js right now — not worth chasing further.
//
// each dtype gets its own cached pipeline instance in self._pipelines, so switching between q8 and
// fp16 mid-session doesn't re-trigger a download for one already fetched.

self.onmessage = async (e) => {
  const { file, dtype } = e.data;
  const chosenDtype = dtype || 'q8';
  try {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');

    if (!self._pipelines) self._pipelines = {};
    if (!self._pipelines[chosenDtype]) {
      self._pipelines[chosenDtype] = pipeline('background-removal', 'briaai/RMBG-1.4', {
        dtype: chosenDtype,
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            self.postMessage({ type: 'progress', key: p.file || 'model', current: p.loaded, total: p.total });
          }
        }
      });
    }
    const segmenter = await self._pipelines[chosenDtype];

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
