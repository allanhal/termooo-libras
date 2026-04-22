// Static (single-frame) samples ----------------------------------------------

export async function fetchSamples() {
  const res = await fetch("/api/samples");
  if (!res.ok) throw new Error(`GET /api/samples failed: ${res.status}`);
  const { samples } = await res.json();
  return samples;
}

export async function postSample({ label, landmarks, handedness, deviceId }) {
  const res = await fetch("/api/samples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, landmarks, handedness, deviceId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/samples failed: ${res.status} ${text}`);
  }
  const { sample } = await res.json();
  return sample;
}

export async function deleteSample(id, adminToken) {
  const res = await fetch(`/api/samples?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-admin-token": adminToken },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE /api/samples failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Motion (sequence) samples ---------------------------------------------------

export async function fetchMotionSamples({ includeFrames = false } = {}) {
  const url = includeFrames ? "/api/motion?frames=1" : "/api/motion";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET /api/motion failed: ${res.status}`);
  const { samples } = await res.json();
  return samples;
}

export async function postMotionSample({
  label,
  frames,
  durationMs,
  handedness,
  deviceId,
}) {
  const res = await fetch("/api/motion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, frames, durationMs, handedness, deviceId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/motion failed: ${res.status} ${text}`);
  }
  const { sample } = await res.json();
  return sample;
}

export async function deleteMotionSample(id, adminToken) {
  const res = await fetch(`/api/motion?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-admin-token": adminToken },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE /api/motion failed: ${res.status} ${text}`);
  }
  return res.json();
}
