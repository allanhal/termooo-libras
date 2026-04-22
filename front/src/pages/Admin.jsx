import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { deleteSample, fetchSamples } from "../lib/api.js";
import { countsByLetter } from "../lib/classifier.js";
import { drawHandFit } from "../lib/handDraw.js";
import { getAdminToken, setAdminToken } from "../lib/adminToken.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
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
      style={{
        background: "#111",
        borderRadius: 6,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
      }}
    />
  );
}

export default function Admin() {
  const [token, setToken] = useState(() => getAdminToken());
  const [tokenInput, setTokenInput] = useState("");
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const counts = useMemo(() => countsByLetter(samples), [samples]);
  const visible = useMemo(() => {
    if (filter === "ALL") return samples;
    return samples.filter((s) => s.letter === filter);
  }, [samples, filter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchSamples();
      setSamples(all);
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

  async function handleDelete(id) {
    if (!confirm(`Apagar amostra #${id}?`)) return;
    try {
      await deleteSample(id, token);
      setSamples((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e.message ?? String(e));
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(samples, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    a.download = `termooo-libras-samples-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
                  <MenuItem value="ALL">
                    Todas ({samples.length})
                  </MenuItem>
                  {LETTERS.map((l) => (
                    <MenuItem key={l} value={l} disabled={!counts.get(l)}>
                      {l} ({counts.get(l) ?? 0})
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button onClick={load} disabled={loading}>
                  {loading ? "Carregando..." : "Recarregar"}
                </Button>
                <Button onClick={handleExport} disabled={!samples.length}>
                  Exportar JSON
                </Button>
                <Button color="warning" onClick={handleLogout}>
                  Sair
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {visible.length} amostra(s)
            </Typography>
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
              {visible.map((s) => (
                <Paper
                  key={s.id}
                  variant="outlined"
                  sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Chip label={s.letter} color="primary" size="small" />
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
                    onClick={() => handleDelete(s.id)}
                  >
                    Apagar
                  </Button>
                </Paper>
              ))}
            </Box>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}
