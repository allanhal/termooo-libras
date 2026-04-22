import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import {
  deleteMotionSample,
  deleteSample,
  fetchMotionSamples,
  fetchSamples,
} from "../lib/api.js";
import { countsByLabel } from "../lib/classifier.js";
import { drawHandFit } from "../lib/handDraw.js";
import { getAdminToken, setAdminToken } from "../lib/adminToken.js";

const THUMB_SIZE = 120;

function SampleThumb({ landmarks }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawHandFit(ctx, landmarks, canvas.width, canvas.height, {
      strokeColor: "#67C090",
      pointColor: "#B87C4C",
      lineWidth: 2,
      pointRadius: 3,
    });
  }, [landmarks]);
  return (
    <canvas
      ref={ref}
      width={THUMB_SIZE}
      height={THUMB_SIZE}
      style={{ background: "#111", borderRadius: 6, width: THUMB_SIZE, height: THUMB_SIZE }}
    />
  );
}

// For motion, we show the first frame as a static thumbnail. We skip fetching
// the heavy `frames` array until the admin clicks "Ver" on a specific sample.
function MotionThumb({ frames }) {
  return <SampleThumb landmarks={frames?.[0] ?? null} />;
}

function MotionPlaybackDialog({ sample, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!sample || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let i = 0;
    const id = setInterval(() => {
      drawHandFit(ctx, sample.frames[i], canvas.width, canvas.height, {
        strokeColor: "#67C090",
        pointColor: "#B87C4C",
      });
      i = (i + 1) % sample.frames.length;
    }, 50);
    return () => clearInterval(id);
  }, [sample]);
  if (!sample) return null;
  return (
    <Box
      onClick={onClose}
      sx={{
        position: "fixed",
        inset: 0,
        bgcolor: "rgba(0,0,0,0.7)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper
        onClick={(e) => e.stopPropagation()}
        sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}
      >
        <Typography variant="h6">
          {sample.label} · #{sample.id} · {sample.frames.length} frames
        </Typography>
        <canvas ref={ref} width={320} height={320} style={{ background: "#111", borderRadius: 6 }} />
        <Button onClick={onClose}>Fechar</Button>
      </Paper>
    </Box>
  );
}

export default function Admin() {
  const [token, setToken] = useState(() => getAdminToken());
  const [tokenInput, setTokenInput] = useState("");
  const [tab, setTab] = useState("static");
  const [staticSamples, setStaticSamples] = useState([]);
  const [motionSamples, setMotionSamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [playback, setPlayback] = useState(null);

  const staticCounts = useMemo(() => countsByLabel(staticSamples), [staticSamples]);
  const motionCounts = useMemo(() => countsByLabel(motionSamples), [motionSamples]);

  const labels = useMemo(() => {
    const set = new Set();
    for (const s of staticSamples) set.add(s.label);
    for (const s of motionSamples) set.add(s.label);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [staticSamples, motionSamples]);

  const visibleStatic = useMemo(() => {
    return filter === "ALL"
      ? staticSamples
      : staticSamples.filter((s) => s.label === filter);
  }, [staticSamples, filter]);

  const visibleMotion = useMemo(() => {
    return filter === "ALL"
      ? motionSamples
      : motionSamples.filter((s) => s.label === filter);
  }, [motionSamples, filter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [statics, motions] = await Promise.all([
        fetchSamples(),
        fetchMotionSamples({ includeFrames: true }),
      ]);
      setStaticSamples(statics);
      setMotionSamples(motions);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleUnlock(e) {
    e.preventDefault();
    const t = tokenInput.trim();
    setAdminToken(t);
    setToken(t);
    setTokenInput("");
  }

  function handleLogout() {
    setAdminToken("");
    setToken("");
  }

  async function handleDeleteStatic(id) {
    if (!confirm(`Apagar amostra estática #${id}?`)) return;
    try {
      await deleteSample(id, token);
      setStaticSamples((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e.message ?? String(e));
    }
  }

  async function handleDeleteMotion(id) {
    if (!confirm(`Apagar movimento #${id}?`)) return;
    try {
      await deleteMotionSample(id, token);
      setMotionSamples((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e.message ?? String(e));
    }
  }

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1100, mx: "auto" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h4">Admin</Typography>
        <Stack direction="row" spacing={1}>
          <Button component={Link} to="/detect" size="small">
            /detect
          </Button>
          <Button component={Link} to="/" size="small">
            ← Início
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!token ? (
        <Paper sx={{ p: 3 }}>
          <Stack
            component="form"
            spacing={2}
            onSubmit={handleUnlock}
            sx={{ maxWidth: 400 }}
          >
            <Typography variant="h6">Token de admin</Typography>
            <Typography variant="body2" color="text.secondary">
              Necessário para apagar amostras. Configure em{" "}
              <code>ADMIN_TOKEN</code> nas variáveis do Vercel.
            </Typography>
            <TextField
              size="small"
              type="password"
              autoFocus
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="••••••••"
            />
            <Button type="submit" variant="contained">
              Entrar
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2">Filtrar:</Typography>
                <Select
                  size="small"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <MenuItem value="ALL">Todas</MenuItem>
                  {labels.map((l) => (
                    <MenuItem key={l} value={l}>
                      {l} ({(staticCounts.get(l) ?? 0) + (motionCounts.get(l) ?? 0)})
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button onClick={load} disabled={loading}>
                  {loading ? "Carregando..." : "Recarregar"}
                </Button>
                <Button color="warning" onClick={handleLogout}>
                  Sair
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab
                label={`Estáticas (${visibleStatic.length})`}
                value="static"
              />
              <Tab
                label={`Movimento (${visibleMotion.length})`}
                value="motion"
              />
            </Tabs>
          </Paper>

          {tab === "static" ? (
            <Paper sx={{ p: 2 }}>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "repeat(auto-fill, minmax(150px, 1fr))",
                    sm: "repeat(auto-fill, minmax(180px, 1fr))",
                  },
                }}
              >
                {visibleStatic.map((s) => (
                  <Paper
                    key={s.id}
                    variant="outlined"
                    sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Chip label={s.label} color="primary" size="small" />
                      <Typography variant="caption" color="text.secondary">
                        #{s.id}
                      </Typography>
                    </Stack>
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                      <SampleThumb landmarks={s.landmarks} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {s.handedness ?? "?"} ·{" "}
                      {new Date(s.created_at).toLocaleString()}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "monospace", fontSize: 10 }}
                      noWrap
                      title={s.device_id ?? ""}
                    >
                      {s.device_id?.slice(0, 8) ?? "anon"}
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteStatic(s.id)}
                    >
                      Apagar
                    </Button>
                  </Paper>
                ))}
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ p: 2 }}>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "repeat(auto-fill, minmax(150px, 1fr))",
                    sm: "repeat(auto-fill, minmax(180px, 1fr))",
                  },
                }}
              >
                {visibleMotion.map((s) => (
                  <Paper
                    key={s.id}
                    variant="outlined"
                    sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Chip label={s.label} color="primary" size="small" />
                      <Typography variant="caption" color="text.secondary">
                        #{s.id}
                      </Typography>
                    </Stack>
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                      <MotionThumb frames={s.frames} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {s.frame_count ?? s.frames?.length ?? 0} frames ·{" "}
                      {s.duration_ms ? `${(s.duration_ms / 1000).toFixed(2)}s` : "?"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {s.handedness ?? "?"} ·{" "}
                      {new Date(s.created_at).toLocaleString()}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        onClick={() => setPlayback(s)}
                        disabled={!s.frames}
                      >
                        Ver
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleDeleteMotion(s.id)}
                      >
                        Apagar
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            </Paper>
          )}
        </Stack>
      )}
      <MotionPlaybackDialog sample={playback} onClose={() => setPlayback(null)} />
    </Stack>
  );
}
