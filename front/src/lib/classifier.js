// Hand-landmark k-NN classifier.
//
// Input: 21 MediaPipe hand landmarks { x, y, z } (image-normalized 0..1).
// We translate the wrist to the origin and scale by the wrist→middle-finger-MCP
// distance so the representation is invariant to position and hand size. The
// resulting 63-dim vector is compared with cosine similarity against all
// stored samples; we aggregate by letter using inverse-distance-weighted votes.

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

// Build an in-memory index from the DB rows.
export function buildIndex(samples) {
  const index = [];
  for (const s of samples) {
    const vec = normalizeLandmarks(s.landmarks);
    if (vec) index.push({ id: s.id, letter: s.letter, vec });
  }
  return index;
}

// Classify a raw landmark array against the prebuilt index.
// Returns { letter, confidence, margin, counts, neighbors } or null when empty.
export function classify(index, landmarks, { k = 5 } = {}) {
  if (!index.length) return null;
  const query = normalizeLandmarks(landmarks);
  if (!query) return null;

  const scored = index.map((item) => ({
    letter: item.letter,
    distance: cosineDistance(query, item.vec),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  const neighbors = scored.slice(0, Math.min(k, scored.length));

  const weights = new Map();
  let totalWeight = 0;
  for (const n of neighbors) {
    const w = 1 / (n.distance + 1e-6);
    weights.set(n.letter, (weights.get(n.letter) ?? 0) + w);
    totalWeight += w;
  }

  const ranked = [...weights.entries()]
    .map(([letter, w]) => ({ letter, score: w / totalWeight }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;

  return {
    letter: top.letter,
    confidence: top.score,
    margin: top.score - second,
    ranked,
    neighbors,
  };
}

// Per-letter sample counts from raw DB rows.
export function countsByLetter(samples) {
  const map = new Map();
  for (const s of samples) map.set(s.letter, (map.get(s.letter) ?? 0) + 1);
  return map;
}
