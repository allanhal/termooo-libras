// Hand-landmark classifiers.
//
// STATIC: single-frame pose. 21 landmarks are translated to the wrist and
// scaled by the wrist→middle-finger-MCP distance, producing a 63-dim vector.
// We do k-NN with cosine distance and inverse-distance-weighted votes.
//
// MOTION: time series of 21-landmark frames. Each frame is normalized the
// same way, then sequences are compared with Dynamic Time Warping (DTW).

const WRIST = 0;
const MIDDLE_MCP = 9;

export function normalizeLandmarks(landmarks) {
  if (!landmarks || landmarks.length !== 21) return null;
  const wrist = landmarks[WRIST];
  const mcp = landmarks[MIDDLE_MCP];
  const dx = mcp.x - wrist.x;
  const dy = mcp.y - wrist.y;
  const dz = (mcp.z ?? 0) - (wrist.z ?? 0);
  const scale = Math.hypot(dx, dy, dz) || 1;

  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    out[i * 3 + 0] = (p.x - wrist.x) / scale;
    out[i * 3 + 1] = (p.y - wrist.y) / scale;
    out[i * 3 + 2] = ((p.z ?? 0) - (wrist.z ?? 0)) / scale;
  }
  return out;
}

function cosineDistance(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

// Static: build an in-memory index from DB rows.
export function buildIndex(samples) {
  const index = [];
  for (const s of samples) {
    const vec = normalizeLandmarks(s.landmarks);
    if (vec) index.push({ id: s.id, label: s.label, vec });
  }
  return index;
}

export function classify(index, landmarks, { k = 5 } = {}) {
  if (!index.length) return null;
  const query = normalizeLandmarks(landmarks);
  if (!query) return null;

  const scored = index.map((item) => ({
    label: item.label,
    distance: cosineDistance(query, item.vec),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  const neighbors = scored.slice(0, Math.min(k, scored.length));

  const weights = new Map();
  let totalWeight = 0;
  for (const n of neighbors) {
    const w = 1 / (n.distance + 1e-6);
    weights.set(n.label, (weights.get(n.label) ?? 0) + w);
    totalWeight += w;
  }

  const ranked = [...weights.entries()]
    .map(([label, w]) => ({ label, score: w / totalWeight }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;

  return {
    label: top.label,
    confidence: top.score,
    margin: top.score - second,
    ranked,
    neighbors,
  };
}

export function countsByLabel(samples) {
  const map = new Map();
  for (const s of samples) map.set(s.label, (map.get(s.label) ?? 0) + 1);
  return map;
}

// ----- Motion (DTW) ---------------------------------------------------------

// Resample a sequence of normalized vectors to a fixed length so DTW stays
// cheap and length-invariant. Uses linear interpolation between source frames.
function resampleSeq(seq, targetLen) {
  if (seq.length === 0) return [];
  if (seq.length === targetLen) return seq;
  const out = new Array(targetLen);
  const step = (seq.length - 1) / (targetLen - 1);
  for (let i = 0; i < targetLen; i++) {
    const src = i * step;
    const lo = Math.floor(src);
    const hi = Math.min(seq.length - 1, lo + 1);
    const t = src - lo;
    const a = seq[lo];
    const b = seq[hi];
    const v = new Float32Array(a.length);
    for (let j = 0; j < a.length; j++) v[j] = a[j] * (1 - t) + b[j] * t;
    out[i] = v;
  }
  return out;
}

const MOTION_LEN = 32;

export function normalizeSequence(frames) {
  const vecs = [];
  for (const f of frames) {
    const v = normalizeLandmarks(f);
    if (v) vecs.push(v);
  }
  if (vecs.length < 2) return null;
  return resampleSeq(vecs, MOTION_LEN);
}

// Sakoe-Chiba-banded DTW with cosine cell cost. Returns an avg distance in
// [0, 2] (cosine distance is 0..2).
function dtwDistance(a, b, bandRatio = 0.2) {
  const n = a.length;
  const m = b.length;
  const band = Math.max(2, Math.floor(Math.max(n, m) * bandRatio));
  const INF = Infinity;
  // Rolling two rows.
  let prev = new Float64Array(m + 1).fill(INF);
  let curr = new Float64Array(m + 1).fill(INF);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr.fill(INF);
    const jLo = Math.max(1, i - band);
    const jHi = Math.min(m, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const c = cosineDistance(a[i - 1], b[j - 1]);
      curr[j] = c + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  const raw = prev[m];
  if (!Number.isFinite(raw)) return 2;
  return raw / (n + m);
}

export function buildMotionIndex(samples) {
  const index = [];
  for (const s of samples) {
    if (!Array.isArray(s.frames)) continue;
    const seq = normalizeSequence(s.frames);
    if (seq) index.push({ id: s.id, label: s.label, seq });
  }
  return index;
}

export function classifyMotion(index, frames, { k = 3 } = {}) {
  if (!index.length) return null;
  const query = normalizeSequence(frames);
  if (!query) return null;

  const scored = index.map((item) => ({
    label: item.label,
    distance: dtwDistance(query, item.seq),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  const neighbors = scored.slice(0, Math.min(k, scored.length));

  const weights = new Map();
  let totalWeight = 0;
  for (const n of neighbors) {
    const w = 1 / (n.distance + 1e-6);
    weights.set(n.label, (weights.get(n.label) ?? 0) + w);
    totalWeight += w;
  }

  const ranked = [...weights.entries()]
    .map(([label, w]) => ({ label, score: w / totalWeight }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;

  return {
    label: top.label,
    confidence: top.score,
    margin: top.score - second,
    ranked,
    neighbors,
  };
}
