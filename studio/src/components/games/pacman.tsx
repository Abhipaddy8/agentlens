"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface PacManProps {
  paused: boolean;
}

const CELL = 20;
const COLS = 19;
const ROWS = 15;
const W = COLS * CELL;
const H = ROWS * CELL;

// 0=empty, 1=wall, 2=dot, 3=power dot
const BASE_MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1],
  [1,0,0,0,2,0,0,0,0,0,0,0,0,0,2,0,0,0,1],
  [1,1,1,1,2,1,0,1,1,0,1,1,0,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,1,2,2,2,2,2,1,2,2,2,2,2,1,2,2,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

type Dir = { x: number; y: number };
type Ghost = { x: number; y: number; dir: Dir; color: string; scared: boolean };

export function PacMan({ paused }: PacManProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const stateRef = useRef({
    map: BASE_MAP.map((r) => [...r]),
    px: 9, py: 7,
    dir: { x: 0, y: 0 } as Dir,
    nextDir: { x: 0, y: 0 } as Dir,
    ghosts: [
      { x: 7, y: 3, dir: { x: 1, y: 0 }, color: "#ef4444", scared: false },
      { x: 11, y: 3, dir: { x: -1, y: 0 }, color: "#f472b6", scared: false },
    ] as Ghost[],
    score: 0,
    gameOver: false,
    mouthOpen: true,
    powerTimer: 0,
    dotsLeft: 0,
  });

  // Count initial dots
  useEffect(() => {
    let count = 0;
    BASE_MAP.forEach((row) => row.forEach((c) => { if (c === 2 || c === 3) count++; }));
    stateRef.current.dotsLeft = count;
  }, []);

  const canMove = useCallback((x: number, y: number): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return stateRef.current.map[y][x] !== 1;
  }, []);

  const moveGhost = useCallback((g: Ghost) => {
    const dirs: Dir[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const reverse = { x: -g.dir.x, y: -g.dir.y };
    const possible = dirs.filter(
      (d) => !(d.x === reverse.x && d.y === reverse.y) && canMove(g.x + d.x, g.y + d.y)
    );
    if (possible.length === 0) {
      if (canMove(g.x + reverse.x, g.y + reverse.y)) {
        g.dir = reverse;
      }
      return;
    }
    // Bias toward pac-man if not scared, away if scared
    const s = stateRef.current;
    possible.sort((a, b) => {
      const da = Math.abs(g.x + a.x - s.px) + Math.abs(g.y + a.y - s.py);
      const db = Math.abs(g.x + b.x - s.px) + Math.abs(g.y + b.y - s.py);
      return g.scared ? db - da : da - db;
    });
    // Some randomness
    g.dir = Math.random() < 0.3 ? possible[Math.floor(Math.random() * possible.length)] : possible[0];
    g.x += g.dir.x;
    g.y += g.dir.y;
  }, [canMove]);

  const tick = useCallback(() => {
    const s = stateRef.current;

    // Try next direction first
    if (canMove(s.px + s.nextDir.x, s.py + s.nextDir.y)) {
      s.dir = s.nextDir;
    }
    if (canMove(s.px + s.dir.x, s.py + s.dir.y)) {
      s.px += s.dir.x;
      s.py += s.dir.y;
    }

    // Eat dots
    const tile = s.map[s.py]?.[s.px];
    if (tile === 2) {
      s.map[s.py][s.px] = 0;
      s.score += 10;
      s.dotsLeft--;
      setScore(s.score);
    } else if (tile === 3) {
      s.map[s.py][s.px] = 0;
      s.score += 50;
      s.dotsLeft--;
      s.powerTimer = 60;
      s.ghosts.forEach((g) => (g.scared = true));
      setScore(s.score);
    }

    // Power timer
    if (s.powerTimer > 0) {
      s.powerTimer--;
      if (s.powerTimer === 0) s.ghosts.forEach((g) => (g.scared = false));
    }

    // Move ghosts
    s.ghosts.forEach((g) => moveGhost(g));

    // Ghost collision
    for (const g of s.ghosts) {
      if (g.x === s.px && g.y === s.py) {
        if (g.scared) {
          g.x = 9; g.y = 7;
          g.scared = false;
          s.score += 200;
          setScore(s.score);
        } else {
          s.gameOver = true;
          setGameOver(true);
        }
      }
    }

    // Win check
    if (s.dotsLeft <= 0) {
      s.gameOver = true;
      setGameOver(true);
    }

    s.mouthOpen = !s.mouthOpen;
  }, [canMove, moveGhost]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, W, H);

    // Map
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const t = s.map[r][c];
        if (t === 1) {
          ctx.fillStyle = "#1e3a5f";
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 1;
          ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
        } else if (t === 2) {
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(c * CELL + CELL / 2, r * CELL + CELL / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === 3) {
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(c * CELL + CELL / 2, r * CELL + CELL / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

    // Pac-Man
    const cx = s.px * CELL + CELL / 2;
    const cy = s.py * CELL + CELL / 2;
    const angle = Math.atan2(s.dir.y, s.dir.x);
    const mouth = s.mouthOpen ? 0.3 : 0.05;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(cx, cy, CELL / 2 - 2, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI);
    ctx.lineTo(cx, cy);
    ctx.fill();

    // Ghosts
    for (const g of s.ghosts) {
      const gx = g.x * CELL + CELL / 2;
      const gy = g.y * CELL + CELL / 2;
      ctx.fillStyle = g.scared ? "#6366f1" : g.color;
      // Ghost body
      ctx.beginPath();
      ctx.arc(gx, gy - 2, CELL / 2 - 2, Math.PI, 0);
      ctx.lineTo(gx + CELL / 2 - 2, gy + CELL / 2 - 2);
      // Wavy bottom
      const w = (CELL - 4) / 3;
      for (let i = 0; i < 3; i++) {
        const bx = gx + CELL / 2 - 2 - i * w;
        ctx.quadraticCurveTo(bx - w / 2, gy + CELL / 2 - 6, bx - w, gy + CELL / 2 - 2);
      }
      ctx.fill();
      // Eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(gx - 3, gy - 3, 3, 0, Math.PI * 2);
      ctx.arc(gx + 3, gy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.scared ? "#fff" : "#111";
      ctx.beginPath();
      ctx.arc(gx - 3 + g.dir.x, gy - 3 + g.dir.y, 1.5, 0, Math.PI * 2);
      ctx.arc(gx + 3 + g.dir.x, gy - 3 + g.dir.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pause overlay
    if (pausedRef.current && !s.gameOver) {
      ctx.fillStyle = "rgba(15,15,26,0.75)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#6366f1";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, H / 2);
      ctx.textAlign = "start";
    }

    if (s.gameOver) {
      ctx.fillStyle = "rgba(15,15,26,0.8)";
      ctx.fillRect(0, 0, W, H);
      const won = s.dotsLeft <= 0;
      ctx.fillStyle = won ? "#10b981" : "#ef4444";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(won ? "YOU WIN!" : "GAME OVER", W / 2, H / 2 - 10);
      ctx.fillStyle = "#8888aa";
      ctx.font = "13px sans-serif";
      ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 14);
      ctx.textAlign = "start";
    }
  }, []);

  useEffect(() => {
    let running = true;
    function loop(time: number) {
      if (!running) return;
      if (!pausedRef.current && !stateRef.current.gameOver) {
        if (time - lastTickRef.current > 180) {
          tick();
          lastTickRef.current = time;
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [tick, draw]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pausedRef.current || stateRef.current.gameOver) return;
      const s = stateRef.current;
      switch (e.key) {
        case "ArrowUp":    s.nextDir = { x: 0, y: -1 }; break;
        case "ArrowDown":  s.nextDir = { x: 0, y: 1 };  break;
        case "ArrowLeft":  s.nextDir = { x: -1, y: 0 }; break;
        case "ArrowRight": s.nextDir = { x: 1, y: 0 };  break;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const restart = useCallback(() => {
    const s = stateRef.current;
    s.map = BASE_MAP.map((r) => [...r]);
    s.px = 9; s.py = 7;
    s.dir = { x: 0, y: 0 };
    s.nextDir = { x: 0, y: 0 };
    s.score = 0;
    s.gameOver = false;
    s.powerTimer = 0;
    s.ghosts[0] = { x: 7, y: 3, dir: { x: 1, y: 0 }, color: "#ef4444", scared: false };
    s.ghosts[1] = { x: 11, y: 3, dir: { x: -1, y: 0 }, color: "#f472b6", scared: false };
    let count = 0;
    BASE_MAP.forEach((row) => row.forEach((c) => { if (c === 2 || c === 3) count++; }));
    s.dotsLeft = count;
    setScore(0);
    setGameOver(false);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-lens-muted">
        Score: <span className="text-lens-text font-mono">{score}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-lg border border-lens-border/40"
        tabIndex={0}
      />
      {gameOver && (
        <button
          onClick={restart}
          className="text-xs text-lens-accent hover:text-lens-accent/80 transition-colors"
        >
          Play Again
        </button>
      )}
      <p className="text-[10px] text-lens-muted/60">Arrow keys to move | Eat all dots to win</p>
    </div>
  );
}
