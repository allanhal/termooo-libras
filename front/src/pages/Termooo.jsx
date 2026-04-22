import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import "./Termooo.css";

const WORDS = [
  "casal",
  "ratos",
];

const MAX_ROWS = 6;
const COLS = 5;

function getWordOfDay() {
  const start = new Date(2025, 0, 1);
  const today = new Date();
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return WORDS[((diff % WORDS.length) + WORDS.length) % WORDS.length];
}

function letterSrc(letter) {
  return `/libras/${letter.toLowerCase()}.png`;
}

function emptyBoard() {
  return Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(""));
}

function emptyMarks() {
  return Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
}

function classify(guess, target) {
  const result = Array(COLS).fill("dark");
  const tArr = target.split("");
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === tArr[i]) {
      result[i] = "green";
      tArr[i] = null;
    }
  }
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "green") continue;
    const idx = tArr.indexOf(guess[i]);
    if (idx > -1) {
      result[i] = "yellow";
      tArr[idx] = null;
    }
  }
  return result;
}

const ROW_TOP = "qwertyuiop".split("");
const ROW_MID = "asdfghjkl".split("");
const ROW_LOW = "zxcvbnm".split("");

export default function Termooo() {
  const target = useMemo(() => getWordOfDay(), []);

  const [board, setBoard] = useState(emptyBoard);
  const [marks, setMarks] = useState(emptyMarks);
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [status, setStatus] = useState("");
  const [finished, setFinished] = useState(false);

  const keyStates = useMemo(() => {
    const rank = { green: 3, yellow: 2, dark: 1 };
    const best = new Map();
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const mark = marks[r][c];
        const letter = board[r][c];
        if (!mark || !letter) continue;
        const current = best.get(letter);
        if (!current || rank[mark] > rank[current]) {
          best.set(letter, mark);
        }
      }
    }
    return best;
  }, [board, marks]);

  const pressLetter = useCallback(
    (raw) => {
      if (finished) return;
      const letter = raw.toLowerCase();
      if (letter.length !== 1 || letter < "a" || letter > "z") return;
      setBoard((prev) => {
        if (col >= COLS) return prev;
        const next = prev.map((r) => [...r]);
        next[row][col] = letter;
        return next;
      });
      setCol((c) => (c < COLS ? c + 1 : c));
    },
    [col, row, finished],
  );

  const backspace = useCallback(() => {
    if (finished) return;
    setBoard((prev) => {
      if (col <= 0) return prev;
      const next = prev.map((r) => [...r]);
      next[row][col - 1] = "";
      return next;
    });
    setCol((c) => (c > 0 ? c - 1 : c));
  }, [col, row, finished]);

  const submit = useCallback(() => {
    if (finished) return;
    if (col !== COLS) {
      setStatus("Preencha 5 letras.");
      return;
    }
    const guess = board[row].join("");
    const result = classify(guess, target);
    setMarks((prev) => {
      const next = prev.map((r) => [...r]);
      next[row] = result;
      return next;
    });

    if (guess === target) {
      setStatus(`Parabéns! A palavra do dia era "${target}".`);
      setFinished(true);
      return;
    }
    if (row + 1 >= MAX_ROWS) {
      setStatus(`Fim! A palavra era "${target}".`);
      setFinished(true);
      return;
    }
    setRow((r) => r + 1);
    setCol(0);
    setStatus(`Tentativa ${row + 2} de ${MAX_ROWS}.`);
  }, [board, col, row, target, finished]);

  const reset = useCallback(() => {
    setBoard(emptyBoard());
    setMarks(emptyMarks());
    setRow(0);
    setCol(0);
    setFinished(false);
    setStatus("Novo jogo iniciado!");
  }, []);

  // Physical keyboard input.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter") {
        submit();
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key.length === 1) {
        pressLetter(e.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pressLetter, backspace, submit]);

  // VLibras widget.
  useEffect(() => {
    const existing = document.querySelector('script[data-vlibras="1"]');
    if (existing) return undefined;
    const script = document.createElement("script");
    script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
    script.async = true;
    script.dataset.vlibras = "1";
    script.onload = () => {
      try {
        if (window.VLibras) {
          new window.VLibras.Widget("https://vlibras.gov.br/app");
        }
      } catch (err) {
        console.warn("VLibras init failed", err);
      }
    };
    document.body.appendChild(script);
    // Intentionally not removing on unmount: VLibras injects DOM globally and
    // tearing it down mid-session breaks re-entry.
    return undefined;
  }, []);

  return (
    <Box className="termooo-page">
      <Box className="termooo-top">
        <Button component={Link} to="/" size="small">
          ← Início
        </Button>
      </Box>
      <Box className="termooo-app">
        <Stack direction="row" justifyContent="center" spacing={0} className="termooo-title">
          {"termooo".split("").map((ch, i) => (
            <img key={i} className="datilologia" src={letterSrc(ch)} alt={ch} />
          ))}
        </Stack>

        <div className="grid">
          {board.map((rowLetters, r) => (
            <div key={r} className="termooo-row">
              {rowLetters.map((letter, c) => {
                const mark = marks[r][c];
                return (
                  <div
                    key={c}
                    className={`cell ${mark ?? ""}`}
                  >
                    {letter && (
                      <img src={letterSrc(letter)} alt={letter} width={48} height={48} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="termooo-controls">
          <button className="control-btn" onClick={backspace} aria-label="Apagar">⌫</button>
          <button className="control-btn" onClick={submit} aria-label="Enviar">➥</button>
        </div>

        {[ROW_TOP, ROW_MID, ROW_LOW].map((rowLetters, i) => (
          <div key={i} className="keyboard-layer">
            {rowLetters.map((l) => (
              <img
                key={l}
                className={`key ${keyStates.get(l) ?? ""}`}
                src={letterSrc(l)}
                alt={l}
                width={16}
                height={16}
                onClick={() => pressLetter(l)}
              />
            ))}
          </div>
        ))}

        {status && (
          <Typography variant="body2" className="termooo-status">
            {status}
          </Typography>
        )}
        {finished && (
          <Button size="small" onClick={reset} sx={{ mt: 1 }}>
            Jogar de novo
          </Button>
        )}
        <Box className="termooo-footer">Versão com palavra do dia</Box>
      </Box>

      <div vw="true" className="enabled">
        <div vw-access-button="true" className="active"></div>
        <div vw-plugin-wrapper="true">
          <div className="vw-plugin-top-wrapper"></div>
        </div>
      </div>
    </Box>
  );
}
