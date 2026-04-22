import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { getHandLandmarker } from "../lib/handLandmarker.js";
import {
  fetchMotionSamples,
  fetchSamples,
  postMotionSample,
  postSample,
} from "../lib/api.js";
import {
  buildIndex,
  buildMotionIndex,
  classify,
  classifyMotion,
  countsByLabel,
} from "../lib/classifier.js";
import { getDeviceId } from "../lib/deviceId.js";
import { drawHand, drawHandFit } from "../lib/handDraw.js";

const QUICK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CONFIDENCE_THRESHOLD = 0.9;
const MAX_MOTION_FRAMES = 180; // ~6 s at 30 fps
const MIN_TRIM_FRAMES = 4;

function cloneLandmarks(lm) {
  return lm.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
}

export default function Detect() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const landmarkerRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const latestHandednessRef = useRef(null);
  const recordingRef = useRef(false);
  const recordBufferRef = useRef([]);
  const recordStartRef = useRef(0);

  const [status, setStatus] = useState("Carregando...");
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("static");
  const [samples, setSamples] = useState([]);
  const [motionSamples, setMotionSamples] = useState([]);
  const [labelInput, setLabelInput] = useState("A");
  const [prediction, setPrediction] = useState(null);
  const [handVisible, setHandVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Motion recording state.
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordedFrames, setRecordedFrames] = useState(null); // { frames, durationMs }
  const [trim, setTrim] = useState([0, 0]);
  const [playbackFrame, setPlaybackFrame] = useState(0);
  const [motionPostPrediction, setMotionPostPrediction] = useState(null);
  const playbackCanvasRef = useRef(null);

  const staticIndex = useMemo(() => buildIndex(samples), [samples]);
  const staticCounts = useMemo(() => countsByLabel(samples), [samples]);
  const motionCounts = useMemo(() => countsByLabel(motionSamples), [motionSamples]);
  const deviceId = useMemo(() => getDeviceId(), []);
  const label = labelInput.trim();

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setStatus("Carregando modelo de mãos...");
        const [landmarker, loadedStatic, loadedMotion] = await Promise.all([
          getHandLandmarker(),
          fetchSamples().catch((e) => {
            console.warn("fetchSamples failed", e);
            return [];
          }),
          fetchMotionSamples().catch((e) => {
            console.warn("fetchMotionSamples failed", e);
            return [];
          }),
        ]);
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setSamples(loadedStatic);
        setMotionSamples(loadedMotion);

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

        if (recordingRef.current && hand) {
          if (recordBufferRef.current.length < MAX_MOTION_FRAMES) {
            recordBufferRef.current.push(cloneLandmarks(hand));
          } else {
            stopRecording();
          }
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live static prediction (same loop we had before).
  useEffect(() => {
    if (tab !== "static") return undefined;
    const id = setInterval(() => {
      const hand = latestLandmarksRef.current;
      if (!hand || !staticIndex.length) {
        setPrediction(null);
        return;
      }
      setPrediction(classify(staticIndex, hand));
    }, 150);
    return () => clearInterval(id);
  }, [tab, staticIndex]);

  // Recording timer.
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => {
      setRecordElapsed(performance.now() - recordStartRef.current);
    }, 50);
    return () => clearInterval(id);
  }, [recording]);

  // Motion preview loop: animate the canvas between trim[0] and trim[1].
  useEffect(() => {
    if (!recordedFrames || !playbackCanvasRef.current) return undefined;
    const [lo, hi] = trim;
    if (hi <= lo) return undefined;
    let frameIdx = lo;
    setPlaybackFrame(lo);
    const canvas = playbackCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const id = setInterval(() => {
      frameIdx = frameIdx + 1 > hi ? lo : frameIdx + 1;
      setPlaybackFrame(frameIdx);
      drawHandFit(ctx, recordedFrames.frames[frameIdx], canvas.width, canvas.height, {
        strokeColor: "#67C090",
        pointColor: "#B87C4C",
      });
    }, 50);
    return () => clearInterval(id);
  }, [recordedFrames, trim]);

  // ----- static capture -----
  const handleCaptureStatic = useCallback(async () => {
    const hand = latestLandmarksRef.current;
    if (!hand) {
      setError("Nenhuma mão detectada. Posicione sua mão em frente à câmera.");
      return;
    }
    if (!label) {
      setError("Digite um rótulo (letra ou palavra).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await postSample({
        label,
        landmarks: cloneLandmarks(hand),
        handedness: latestHandednessRef.current,
        deviceId,
      });
      setSamples((prev) => [saved, ...prev]);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [label, deviceId]);

  // ----- motion capture -----
  function startRecording() {
    if (recordingRef.current) return;
    recordBufferRef.current = [];
    recordStartRef.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
    setRecordedFrames(null);
    setMotionPostPrediction(null);
    setError(null);
  }

  function stopRecording() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    const frames = recordBufferRef.current;
    const durationMs = performance.now() - recordStartRef.current;
    recordBufferRef.current = [];
    if (frames.length < MIN_TRIM_FRAMES) {
      setError("Gravação muito curta. Mostre a mão na frente da câmera enquanto grava.");
      return;
    }
    setRecordedFrames({ frames, durationMs });
    setTrim([0, frames.length - 1]);
  }

  function discardRecording() {
    setRecordedFrames(null);
    setMotionPostPrediction(null);
    setTrim([0, 0]);
  }

  const handleSaveMotion = useCallback(async () => {
    if (!recordedFrames) return;
    if (!label) {
      setError("Digite um rótulo (letra ou palavra).");
      return;
    }
    const [lo, hi] = trim;
    const trimmed = recordedFrames.frames.slice(lo, hi + 1);
    if (trimmed.length < MIN_TRIM_FRAMES) {
      setError(`Selecione pelo menos ${MIN_TRIM_FRAMES} frames.`);
      return;
    }
    const frac = trimmed.length / recordedFrames.frames.length;
    const durationMs = recordedFrames.durationMs * frac;

    setError(null);
    setSaving(true);
    try {
      const saved = await postMotionSample({
        label,
        frames: trimmed,
        durationMs,
        handedness: latestHandednessRef.current,
        deviceId,
      });
      const nextLibrary = [saved, ...motionSamples];
      setMotionSamples(nextLibrary);
      // Post-save classification: run DTW of what we just captured against
      // the updated motion library so the user sees a confidence reading.
      const idx = buildMotionIndex(nextLibrary);
      setMotionPostPrediction(classifyMotion(idx, trimmed));
      setRecordedFrames(null);
      setTrim([0, 0]);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [recordedFrames, trim, label, motionSamples, deviceId]);

  // Derived values for the static tab's live-confidence progress bar.
  const staticCount = staticCounts.get(label) ?? 0;
  const staticSelectedScore =
    prediction && prediction.label === label
      ? prediction.confidence
      : prediction?.ranked.find((r) => r.label === label)?.score ?? 0;
  const staticMastered =
    staticSelectedScore >= CONFIDENCE_THRESHOLD && staticCount >= 3;

  const motionCount = motionCounts.get(label) ?? 0;
  const motionPostScore =
    motionPostPrediction && motionPostPrediction.label === label
      ? motionPostPrediction.confidence
      : motionPostPrediction?.ranked.find((r) => r.label === label)?.score ?? 0;

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
        {tab === "static" && prediction && (
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
            Detectado: <b>{prediction.label}</b> ·{" "}
            {(prediction.confidence * 100).toFixed(0)}%
          </Box>
        )}
        {recording && (
          <Box
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              px: 2,
              py: 1,
              bgcolor: "rgba(220,0,0,0.75)",
              color: "#fff",
              borderRadius: 2,
              fontFamily: "monospace",
            }}
          >
            ● REC {(recordElapsed / 1000).toFixed(1)}s ·{" "}
            {recordBufferRef.current.length} frames
          </Box>
        )}
        {!handVisible && !status && !recording && (
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
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            indicatorColor="primary"
          >
            <Tab label="Estático" value="static" />
            <Tab label="Movimento" value="motion" />
          </Tabs>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <TextField
              size="small"
              label="Rótulo"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="letra ou palavra"
              sx={{ minWidth: 220 }}
            />
            <Typography variant="body2" color="text.secondary">
              {tab === "static"
                ? `${staticCount} amostra(s) estáticas`
                : `${motionCount} amostra(s) de movimento`}
            </Typography>
          </Stack>

          <Box>
            <Typography variant="caption" color="text.secondary">
              Letras rápidas:
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {QUICK_LETTERS.map((l) => (
                <Chip
                  key={l}
                  label={l}
                  size="small"
                  variant={label === l ? "filled" : "outlined"}
                  onClick={() => setLabelInput(l)}
                />
              ))}
            </Stack>
          </Box>

          {tab === "static" ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  onClick={handleCaptureStatic}
                  disabled={!handVisible || saving || !label}
                >
                  {saving ? "Salvando..." : `Capturar "${label || "?"}"`}
                </Button>
                {staticMastered && (
                  <Chip color="success" label="Pronto! Confiança alta." />
                )}
              </Stack>
              <Box>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">
                    Confiança estática p/ {label || "—"}
                  </Typography>
                  <Typography variant="body2">
                    {(staticSelectedScore * 100).toFixed(0)}% /{" "}
                    {CONFIDENCE_THRESHOLD * 100}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(
                    100,
                    (staticSelectedScore / CONFIDENCE_THRESHOLD) * 100,
                  )}
                />
              </Box>
            </Stack>
          ) : (
            <MotionPanel
              recording={recording}
              recordedFrames={recordedFrames}
              trim={trim}
              setTrim={setTrim}
              onStart={startRecording}
              onStop={stopRecording}
              onDiscard={discardRecording}
              onSave={handleSaveMotion}
              saving={saving}
              label={label}
              playbackCanvasRef={playbackCanvasRef}
              playbackFrame={playbackFrame}
              postPrediction={motionPostPrediction}
              postScore={motionPostScore}
            />
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Biblioteca · estáticas {samples.length} · movimento {motionSamples.length}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {allLabels(staticCounts, motionCounts).map((l) => {
            const s = staticCounts.get(l) ?? 0;
            const m = motionCounts.get(l) ?? 0;
            return (
              <Chip
                key={l}
                label={`${l}: ${s}${m ? ` + ${m}▶` : ""}`}
                color={s + m === 0 ? "default" : "primary"}
                variant={l === label ? "filled" : "outlined"}
                onClick={() => setLabelInput(l)}
              />
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}

function allLabels(a, b) {
  const set = new Set();
  for (const k of a.keys()) set.add(k);
  for (const k of b.keys()) set.add(k);
  if (!set.size) "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((l) => set.add(l));
  return [...set].sort((x, y) => x.localeCompare(y));
}

function MotionPanel({
  recording,
  recordedFrames,
  trim,
  setTrim,
  onStart,
  onStop,
  onDiscard,
  onSave,
  saving,
  label,
  playbackCanvasRef,
  playbackFrame,
  postPrediction,
  postScore,
}) {
  if (recordedFrames) {
    const total = recordedFrames.frames.length;
    const selectedCount = trim[1] - trim[0] + 1;
    const frac = selectedCount / total;
    const selectedMs = recordedFrames.durationMs * frac;
    return (
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Ajuste o início e o fim da gravação. Apenas o trecho selecionado será salvo.
        </Typography>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ md: "center" }}
        >
          <Box
            sx={{
              width: 180,
              height: 180,
              bgcolor: "#111",
              borderRadius: 1,
              alignSelf: { xs: "center", md: "flex-start" },
            }}
          >
            <canvas
              ref={playbackCanvasRef}
              width={180}
              height={180}
              style={{ width: "100%", height: "100%" }}
            />
          </Box>
          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <Slider
              min={0}
              max={total - 1}
              value={trim}
              onChange={(_, v) => setTrim(v)}
              valueLabelDisplay="auto"
              disableSwap
            />
            <Typography variant="body2" color="text.secondary">
              Frame {playbackFrame + 1} / {total} · selecionados {selectedCount}{" "}
              (~{(selectedMs / 1000).toFixed(2)}s)
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={onSave}
                disabled={saving || !label}
              >
                {saving ? "Salvando..." : `Salvar "${label || "?"}"`}
              </Button>
              <Button onClick={onDiscard} color="warning" disabled={saving}>
                Descartar
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        {!recording ? (
          <Button
            variant="contained"
            color="error"
            onClick={onStart}
            disabled={!label}
          >
            ● Gravar movimento
          </Button>
        ) : (
          <Button variant="contained" onClick={onStop}>
            ■ Parar
          </Button>
        )}
        <Typography variant="caption" color="text.secondary">
          Grave até {MAX_MOTION_FRAMES / 30}s; depois você ajusta o início e o fim
          antes de salvar.
        </Typography>
      </Stack>
      {postPrediction && (
        <Box>
          <Typography variant="body2">
            Última detecção: <b>{postPrediction.label}</b> ·{" "}
            {(postPrediction.confidence * 100).toFixed(0)}%
            {postPrediction.label !== label && label && (
              <>
                {" "}· confiança p/ "{label}": {(postScore * 100).toFixed(0)}%
              </>
            )}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, postPrediction.confidence * 100)}
          />
        </Box>
      )}
    </Stack>
  );
}
