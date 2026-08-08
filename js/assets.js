// Optional custom-art loader. If an image exists at the given path it will be
// used to render that entity instead of the emoji placeholder; if it's missing
// (404) or still loading, callers fall back to the emoji automatically.
// This lets custom enemy portraits (e.g. listener-submitted art) be dropped
// into assets/enemies/<id>.png later with zero code changes.
const cache = new Map();

export function tryLoadImage(path) {
  let entry = cache.get(path);
  if (entry) return entry;
  entry = { img: new Image(), loaded: false, failed: false };
  entry.img.onload = () => { entry.loaded = true; };
  entry.img.onerror = () => { entry.failed = true; };
  entry.img.src = path;
  cache.set(path, entry);
  return entry;
}

// Animated sprite-sheet loader: `basePath` (no extension) + `.png` (a single
// horizontal strip of equal-size frames) + `.anim.json` (a manifest describing
// frame size and named clips - see pixel-editor.html's exporter for the exact
// shape, or docs/anim-format.md). One shared texture + one small JSON instead
// of N separate per-frame images, so animated characters cost one extra HTTP
// request total, not one per frame - the strip is still a single GPU upload.
// `entry.ready` only goes true once BOTH the image and the manifest resolve;
// if the manifest is missing (plain old single-image asset, or none at all)
// `entry.ready` simply stays false forever and callers fall back gracefully.
export function tryLoadAnim(basePath) {
  const key = basePath + '#anim';
  let entry = cache.get(key);
  if (entry) return entry;
  entry = { img: new Image(), loaded: false, failed: false, manifest: null, ready: false };
  const checkReady = () => { entry.ready = entry.loaded && !!entry.manifest; };
  entry.img.onload = () => { entry.loaded = true; checkReady(); };
  entry.img.onerror = () => { entry.failed = true; };
  entry.img.src = basePath + '.png';
  fetch(basePath + '.anim.json')
    .then(r => (r.ok ? r.json() : Promise.reject()))
    .then(json => { entry.manifest = json; checkReady(); })
    .catch(() => {}); // no manifest - stays not-ready, caller falls back
  cache.set(key, entry);
  return entry;
}
