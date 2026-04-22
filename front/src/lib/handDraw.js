// MediaPipe hand-connection pairs (pairs of landmark indices).
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// Draw a hand over the full canvas. Landmarks must be image-normalized (0..1).
export function drawHand(ctx, landmarks, width, height, opts = {}) {
  const {
    clear = true,
    strokeColor = "#67C090",
    pointColor = "#B87C4C",
    lineWidth = 3,
    pointRadius = 4,
  } = opts;

  if (clear) ctx.clearRect(0, 0, width, height);
  if (!landmarks?.length) return;

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeColor;
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = pointColor;
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Draw a hand centered/scaled into the canvas (for thumbnails where the
// original image frame is long gone).
export function drawHandFit(ctx, landmarks, width, height, opts = {}) {
  if (!landmarks?.length) {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 0.1;
  const scale = Math.min(
    (width * (1 - 2 * pad)) / rangeX,
    (height * (1 - 2 * pad)) / rangeY,
  );
  const offsetX = (width - rangeX * scale) / 2 - minX * scale;
  const offsetY = (height - rangeY * scale) / 2 - minY * scale;

  const projected = landmarks.map((p) => ({
    x: (p.x * scale + offsetX) / width,
    y: (p.y * scale + offsetY) / height,
  }));
  drawHand(ctx, projected, width, height, opts);
}
