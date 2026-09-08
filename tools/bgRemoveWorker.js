// dedicated Web Worker for background removal — runs on its own real OS thread, completely separate
// from the page's main thread. this is the actual fix for the freeze: we stopped relying on the
// @imgly/background-removal library's own internal worker spawning (via its proxyToWorker config option),
// which apparently wasn't succeeding when the library is loaded from a CDN instead of a real bundler.
// instead we spin up a plain, standard module Worker ourselves and do the heavy lifting inside it.
// the main thread stays completely free the whole time — cursor, clicks, and any CSS/JS-driven UI
// (including a normal, honestly-real progress bar) keep working exactly as normal.

self.onmessage = async (e) => {
  const { file } = e.data;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
    let fn = mod.default;
    if (typeof fn !== 'function' && mod.default && typeof mod.default.default === 'function') fn = mod.default.default;
    if (typeof fn !== 'function' && typeof mod.removeBackground === 'function') fn = mod.removeBackground;
    if (typeof fn !== 'function') throw new Error('the library loaded but its exports look different than expected');

    const resultBlob = await fn(file, {
      progress: (key, current, total) => {
        self.postMessage({ type: 'progress', key, current, total });
      }
    });

    self.postMessage({ type: 'done', blob: resultBlob });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
