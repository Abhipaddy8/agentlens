"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface SnakeProps {
  paused: boolean;
}

const GRID = 20;
const CELL = 18;
const W = GRID * CELL;
const H = GRID * CELL;

type Pos = { x: number; y: number };

export function Snake({ paused }: SnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }] as Pos[],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 15, y: 10 } as Pos,
    score: 0,
    gameOver: false,
  });

  const placeFood = useCallback(() => {
    const s = stateRef.current;
    let pos: Pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (s.snake.some((p) => p.x === pos.x && p.y === pos.y));
    s.food = pos;
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    s.dir = s.nextDir;
    const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      s.gameOver = true;
      setGameOver(true);
      return;
    }
    // Self collision
    if (s.snake.some((p) => p.x === head.x && p.y === head.y)) {
      s.gameOver = true;
      setGameOver(true);
      return;
    }

    s.snake.unshift(head);

    if (head.x === s.food.x && head.y === s.food.y) {
      s.score += 10;
      setScore(s.score);
      placeFood();
    } else {
      s.snake.pop();
    }
  }, [placeFood]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    // Background
    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); ctx.stroke();
    }

    // Snake
    s.snake.forEach((p, i) => {
      const alpha = 1 - i * 0.02;
      ctx.fillStyle = i === 0 ? "#22d3ee" : `rgba(34,211,238,${Math.max(0.3, alpha)})`;
      ctx.beginPath();
      ctx.roundRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2, 3);
      ctx.fill();
    });

    // Food
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(s.food.x * CELL + CELL / 2 - 2, s.food.y * CELL + CELL / 2 - 2, 3, 0, Math.PI * 2);
    ctx.fill();

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

  useEffect(() => {
    let running = true;
    function loop(time: number) {
      if (!running) return;
      const s = stateRef.current;
      if (!pausedRef.current && !s.gameOver) {
        const speed = Math.max(60, 150 - s.score);
        if (time - lastTickRef.current > speed) {
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
        case "ArrowUp":    if (s.dir.y !== 1)  s.nextDir = { x: 0, y: -1 }; break;
        case "ArrowDown":  if (s.dir.y !== -1) s.nextDir = { x: 0, y: 1 };  break;
        case "ArrowLeft":  if (s.dir.x !== 1)  s.nextDir = { x: -1, y: 0 }; break;
        case "ArrowRight": if (s.dir.x !== -1) s.nextDir = { x: 1, y: 0 };  break;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const restart = useCallback(() => {
    const s = stateRef.current;
    s.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    s.dir = { x: 1, y: 0 };
    s.nextDir = { x: 1, y: 0 };
    s.score = 0;
    s.gameOver = false;
    setScore(0);
    setGameOver(false);
    placeFood();
  }, [placeFood]);

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
      <p className="text-[10px] text-lens-muted/60">Arrow keys to move</p>
    </div>
  );
}
