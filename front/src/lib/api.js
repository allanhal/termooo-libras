export async function fetchSamples() {
  const res = await fetch("/api/samples");
  if (!res.ok) throw new Error(`GET /api/samples failed: ${res.status}`);
  const { samples } = await res.json();
  return samples;
}

export async function postSample({ letter, landmarks, handedness, deviceId }) {
  const res = await fetch("/api/samples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ letter, landmarks, handedness, deviceId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/samples failed: ${res.status} ${text}`);
  }
  const { sample } = await res.json();
  return sample;
}
