// dedicated Web Worker for background removal — runs on its own real OS thread, completely separate
// from the page's main thread. this is the actual fix for the freeze: we stopped relying on the
// library's own internal worker spawning (e.g. imgly's proxyToWorker config option), which wasn't
// succeeding when loaded from a CDN instead of a real bundler. instead we spin up a plain, standard
// module Worker ourselves and do the heavy lifting inside it. the main thread stays completely free
// the whole time — cursor, clicks, and any CSS/JS-driven UI (including a normal, honestly-real
// progress bar) keep working exactly as normal.
//
// two quality tiers now use two genuinely different models, not just different precisions of the
// same one — testing showed q8/fp16/fp32 of RMBG-1.4 gave near-identical results on complex/
// multi-subject images, since quantization only changes numeric precision, not the architecture.
//
// - 'q8' / 'fp16'  → BRIA AI's RMBG-1.4 (CC BY-NC 4.0, non-commercial — fine for this site), through
//                     the 'background-removal' pipeline, which hands back a ready-made RGBA cutout.
// - 'heavy'        → ZhengPeng7/BiRefNet (MIT), a dual-branch architecture built specifically for
//                     complex/high-resolution scenes — an actually different model, not just a bigger
//                     version of the same one. runs through the generic 'image-segmentation' pipeline
//                     instead (that's what BiRefNet is registered under), which only returns a mask,
//                     so we composite the cutout ourselves: draw the original onto an OffscreenCanvas,
//                     then write the mask's grayscale values into its alpha channel pixel by pixel.
//                     nearest-neighbor scaling kicks in if the returned mask isn't the same resolution
//                     as the source image.
//
// each tier gets its own cached pipeline instance in self._pipelines, so switching between them
// mid-session doesn't re-trigger a download for one already fetched.

self.onmessage = async (e) => {
  const { file, dtype } = e.data;
  const chosenDtype = dtype || 'q8';
  try {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');

    if (!self._pipelines) self._pipelines = {};
    let blob;

    if (chosenDtype === 'heavy') {
      if (!self._pipelines.heavy) {
        self._pipelines.heavy = pipeline('image-segmentation', 'ZhengPeng7/BiRefNet', {
          progress_callback: (p) => {
            if (p.status === 'progress' && p.total) {
              self.postMessage({ type: 'progress', key: p.file || 'model', current: p.loaded, total: p.total });
            }
          }
        });
      }
      const segmenter = await self._pipelines.heavy;

      const bitmap = await createImageBitmap(file);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      const objectUrl = URL.createObjectURL(file);
      const output = await segmenter(objectUrl);
      URL.revokeObjectURL(objectUrl);

      const result = Array.isArray(output) ? output[0] : output;
      const mask = result.mask; // RawImage, single-channel grayscale — white = foreground

      const mw = mask.width, mh = mask.height;
      const sameSize = (mw === bitmap.width && mh === bitmap.height);
      for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
          const di = (y * bitmap.width + x) * 4;
          let mv;
          if (sameSize) {
            mv = mask.data[y * mw + x];
          } else {
            const mx = Math.min(mw - 1, Math.floor((x / bitmap.width) * mw));
            const my = Math.min(mh - 1, Math.floor((y / bitmap.height) * mh));
            mv = mask.data[my * mw + mx];
          }
          imageData.data[di + 3] = mv;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      blob = await canvas.convertToBlob({ type: 'image/png' });

    } else {
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
      blob = await result.toBlob();
    }

    self.postMessage({ type: 'done', blob });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
