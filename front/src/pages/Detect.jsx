import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { getHandLandmarker } from "../lib/handLandmarker.js";
import { fetchSamples, postSample } from "../lib/api.js";
import {
  buildIndex,
  classify,
  countsByLetter,
} from "../lib/classifier.js";
import { getDeviceId } from "../lib/deviceId.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CONFIDENCE_THRESHOLD = 0.9;

// MediaPipe hand-connection pairs (pairs of landmark indices).
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function drawHand(ctx, landmarks, width, height) {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks?.length) return;

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#67C090";
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "#B87C4C";
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function Detect() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const landmarkerRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const latestHandednessRef = useRef(null);

  const [status, setStatus] = useState("Carregando...");
  const [error, setError] = useState(null);
  const [samples, setSamples] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState("A");
  const [prediction, setPrediction] = useState(null);
  const [handVisible, setHandVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const index = useMemo(() => buildIndex(samples), [samples]);
  const counts = useMemo(() => countsByLetter(samples), [samples]);
  const deviceId = useMemo(() => getDeviceId(), []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setStatus("Carregando modelo de mãos...");
        const [landmarker, loadedSamples] = await Promise.all([
          getHandLandmarker(),
          fetchSamples().catch((e) => {
            console.warn("fetchSamples failed", e);
            return [];
          }),
        ]);
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setSamples(loadedSamples);

        setStatus("Pedindo acesso à câmera...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setStatus(null);
        tick();
      } catch (e) {
        console.error(e);
        setError(e.message ?? String(e));
        setStatus(null);
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState >= 2) {
        const result = landmarker.detectForVideo(video, performance.now());
        const hand = result.landmarks?.[0] ?? null;
        const handed = result.handednesses?.[0]?.[0]?.categoryName ?? null;
        latestLandmarksRef.current = hand;
        latestHandednessRef.current = handed;
        setHandVisible(!!hand);

        const ctx = canvas.getContext("2d");
        drawHand(ctx, hand, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video?.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    };
  }, []);

  // Refresh live prediction whenever the sample index or hand state changes.
  useEffect(() => {
    const id = setInterval(() => {
      const hand = latestLandmarksRef.current;
      if (!hand || !index.length) {
        setPrediction(null);
        return;
      }
      setPrediction(classify(index, hand));
    }, 150);
    return () => clearInterval(id);
  }, [index]);

  const handleCapture = useCallback(async () => {
    const hand = latestLandmarksRef.current;
    if (!hand) {
      setError("Nenhuma mão detectada. Posicione sua mão em frente à câmera.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await postSample({
        letter: selectedLetter,
        landmarks: hand.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
        handedness: latestHandednessRef.current,
        deviceId,
      });
      setSamples((prev) => [saved, ...prev]);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [selectedLetter, deviceId]);

  const selectedCount = counts.get(selectedLetter) ?? 0;
  const selectedScore =
    prediction && prediction.letter === selectedLetter
      ? prediction.confidence
      : prediction?.ranked.find((r) => r.letter === selectedLetter)?.score ?? 0;
  const mastered = selectedScore >= CONFIDENCE_THRESHOLD && selectedCount >= 3;

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1000, mx: "auto" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h4">Detectar sinais</Typography>
        <Button component={Link} to="/" size="small">
          ← Início
        </Button>
      </Stack>

      {status && <Alert severity="info">{status}</Alert>}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          bgcolor: "#000",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            transform: "scaleX(-1)",
            pointerEvents: "none",
          }}
        />
        {prediction && (
          <Box
            sx={{
              position: "absolute",
              top: 12,
              left: 12,
              px: 2,
              py: 1,
              bgcolor: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 2,
              fontFamily: "monospace",
            }}
          >
            Detectado: <b>{prediction.letter}</b> ·{" "}
            {(prediction.confidence * 100).toFixed(0)}%
          </Box>
        )}
        {!handVisible && !status && (
          <Box
            sx={{
              position: "absolute",
              bottom: 12,
              left: 12,
              px: 2,
              py: 1,
              bgcolor: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 2,
            }}
          >
            Mostre sua mão para a câmera
          </Box>
        )}
      </Box>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Capturar amostra</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
            <Select
              size="small"
              value={selectedLetter}
              onChange={(e) => setSelectedLetter(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              {LETTERS.map((l) => (
                <MenuItem key={l} value={l}>
                  {l} ({counts.get(l) ?? 0})
                </MenuItem>
              ))}
            </Select>
            <Button
              variant="contained"
              onClick={handleCapture}
              disabled={!handVisible || saving}
            >
              {saving ? "Salvando..." : `Capturar ${selectedLetter}`}
            </Button>
            {mastered && (
              <Chip color="success" label="Pronto! Confiança alta." />
            )}
          </Stack>
          <Box>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">
                Confiança p/ {selectedLetter} ({selectedCount} amostras)
              </Typography>
              <Typography variant="body2">
                {(selectedScore * 100).toFixed(0)}% / {CONFIDENCE_THRESHOLD * 100}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (selectedScore / CONFIDENCE_THRESHOLD) * 100)}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Salve várias amostras da mesma letra em ângulos e distâncias
            diferentes. A barra acima mostra a confiança ao vivo contra o que
            você está mostrando agora.
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Biblioteca ({samples.length} amostras no total)
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {LETTERS.map((l) => {
            const n = counts.get(l) ?? 0;
            return (
              <Chip
                key={l}
                label={`${l}: ${n}`}
                color={n === 0 ? "default" : "primary"}
                variant={l === selectedLetter ? "filled" : "outlined"}
                onClick={() => setSelectedLetter(l)}
              />
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}
