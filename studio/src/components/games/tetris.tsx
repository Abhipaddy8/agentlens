"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface TetrisProps {
  paused: boolean;
}

const COLS = 10;
const ROWS = 20;
const CELL = 20;
const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#ef4444", "#10b981", "#a855f7", "#f97316"];

const SHAPES = [
  [[1, 1, 1, 1]],                           // I
  [[1, 1], [1, 1]],                          // O
  [[0, 1, 0], [1, 1, 1]],                    // T
  [[1, 0, 0], [1, 1, 1]],                    // L
  [[0, 0, 1], [1, 1, 1]],                    // J
  [[0, 1, 1], [1, 1, 0]],                    // S
  [[1, 1, 0], [0, 1, 1]],                    // Z
];

type Board = number[][];

function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function rotate(shape: number[][]): number[][] {
  const rows = shape.length, cols = shape[0].length;
  const result: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function collides(board: Board, shape: number[][], x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const nx = x + c, ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
  return false;
}

function merge(board: Board, shape: number[][], x: number, y: number, colorIdx: number): Board {
  const b = board.map((r) => [...r]);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c] && y + r >= 0) b[y + r][x + c] = colorIdx + 1;
  return b;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((c) => c === 0));
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(0));
  return { board: [...empty, ...kept], cleared };
}

export function Tetris({ paused }: TetrisProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    board: createBoard(),
    shape: SHAPES[0],
    colorIdx: 0,
    x: 3,
    y: -2,
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
    nextIdx: Math.floor(Math.random() * SHAPES.length),
  });
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rafRef = useRef<number>(0);
  const lastDropRef = useRef(0);

  const spawn = useCallback(() => {
    const s = stateRef.current;
    s.colorIdx = s.nextIdx;
    s.shape = SHAPES[s.colorIdx];
    s.nextIdx = Math.floor(Math.random() * SHAPES.length);
    s.x = Math.floor((COLS - s.shape[0].length) / 2);
    s.y = -s.shape.length;
    if (collides(s.board, s.shape, s.x, 0)) {
      s.gameOver = true;
      setGameOver(true);
    }
  }, []);

  const lock = useCallback(() => {
    const s = stateRef.current;
    s.board = merge(s.board, s.shape, s.x, s.y, s.colorIdx);
    const { board, cleared } = clearLines(s.board);
    s.board = board;
    s.lines += cleared;
    s.score += [0, 100, 300, 500, 800][cleared] * s.level;
    s.level = Math.floor(s.lines / 10) + 1;
    setScore(s.score);
    setLevel(s.level);
    spawn();
  }, [spawn]);

  const drop = useCallback(() => {
    const s = stateRef.current;
    if (collides(s.board, s.shape, s.x, s.y + 1)) {
      if (s.y < 0) { s.gameOver = true; setGameOver(true); return; }
      lock();
    } else {
      s.y++;
    }
  }, [lock]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;
    const W = COLS * CELL, H = ROWS * CELL;

    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, W + 100, H);

    // Grid
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke(); }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke(); }

    // Board
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (s.board[r][c]) {
          ctx.fillStyle = COLORS[s.board[r][c] - 1];
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, 3);
        }

    // Current piece
    for (let r = 0; r < s.shape.length; r++)
      for (let c = 0; c < s.shape[r].length; c++)
        if (s.shape[r][c] && s.y + r >= 0) {
          ctx.fillStyle = COLORS[s.colorIdx];
          ctx.fillRect((s.x + c) * CELL + 1, (s.y + r) * CELL + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillRect((s.x + c) * CELL + 1, (s.y + r) * CELL + 1, CELL - 2, 3);
        }

    // Next piece preview (right side panel)
    const px = W + 10;
    ctx.fillStyle = "#8888aa";
    ctx.font = "11px monospace";
    ctx.fillText("NEXT", px, 16);

    const nextShape = SHAPES[s.nextIdx];
    for (let r = 0; r < nextShape.length; r++)
      for (let c = 0; c < nextShape[r].length; c++)
        if (nextShape[r][c]) {
          ctx.fillStyle = COLORS[s.nextIdx];
          ctx.fillRect(px + c * 16, 24 + r * 16, 14, 14);
        }

    // Pause overlay
    if (pausedRef.current && !s.gameOver) {
      ctx.fillStyle = "rgba(15,15,26,0.75)";
      ctx.fillRect(0, 0, W + 100, H);
      ctx.fillStyle = "#6366f1";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, H / 2);
      ctx.textAlign = "start";
    }

    if (s.gameOver) {
      ctx.fillStyle = "rgba(15,15,26,0.8)";
      ctx.fillRect(0, 0, W + 100, H);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", W / 2, H / 2 - 10);
      ctx.fillStyle = "#8888aa";
      ctx.font = "13px sans-serif";
      ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 14);
      ctx.textAlign = "start";
    }
  }, []);

  // Game loop
  useEffect(() => {
    spawn();
    let running = true;

    function loop(time: number) {
      if (!running) return;
      const s = stateRef.current;
      if (!pausedRef.current && !s.gameOver) {
        const interval = Math.max(100, 500 - (s.level - 1) * 40);
        if (time - lastDropRef.current > interval) {
          drop();
          lastDropRef.current = time;
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [spawn, drop, draw]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pausedRef.current || stateRef.current.gameOver) return;
      const s = stateRef.current;
      switch (e.key) {
        case "ArrowLeft":
          if (!collides(s.board, s.shape, s.x - 1, s.y)) s.x--;
          break;
        case "ArrowRight":
          if (!collides(s.board, s.shape, s.x + 1, s.y)) s.x++;
          break;
        case "ArrowDown":
          drop();
          break;
        case "ArrowUp": {
          const rotated = rotate(s.shape);
          if (!collides(s.board, rotated, s.x, s.y)) s.shape = rotated;
          break;
        }
        case " ":
          while (!collides(s.board, s.shape, s.x, s.y + 1)) s.y++;
          lock();
          break;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop, lock]);

  const restart = useCallback(() => {
    const s = stateRef.current;
    s.board = createBoard();
    s.score = 0;
    s.level = 1;
    s.lines = 0;
    s.gameOver = false;
    s.nextIdx = Math.floor(Math.random() * SHAPES.length);
    setScore(0);
    setLevel(1);
    setGameOver(false);
    spawn();
  }, [spawn]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-4 text-xs text-lens-muted">
        <span>Score: <span className="text-lens-text font-mono">{score}</span></span>
        <span>Level: <span className="text-lens-text font-mono">{level}</span></span>
      </div>
      <canvas
        ref={canvasRef}
        width={COLS * CELL + 100}
        height={ROWS * CELL}
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
      <p className="text-[10px] text-lens-muted/60">Arrows: move/rotate | Space: hard drop</p>
    </div>
  );
}
