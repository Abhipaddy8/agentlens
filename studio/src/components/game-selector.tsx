"use client";

import { useState, useEffect } from "react";

export type GameChoice = "tetris" | "snake" | "pacman";

interface GameSelectorProps {
  onSelect: (game: GameChoice) => void;
  onDismiss: () => void;
}

const GAMES: { id: GameChoice; name: string; icon: string; desc: string }[] = [
  { id: "tetris", name: "Tetris", icon: "\u25A3", desc: "Stack blocks, clear lines" },
  { id: "snake", name: "Snake", icon: "\u2744", desc: "Eat, grow, survive" },
  { id: "pacman", name: "Pac-Man", icon: "\u25CF", desc: "Eat dots, dodge ghosts" },
];

const STORAGE_KEY = "agentlens-last-game";

export function GameSelector({ onSelect, onDismiss }: GameSelectorProps) {
  const [lastGame, setLastGame] = useState<GameChoice | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as GameChoice | null;
    if (saved) setLastGame(saved);
  }, []);

  function handleSelect(game: GameChoice) {
    localStorage.setItem(STORAGE_KEY, game);
    onSelect(game);
  }

  return (
    <div className="game-selector-card mx-auto max-w-2xl my-3">
      <div className="rounded-xl border border-lens-border/50 bg-lens-surface/60 p-4">
        <p className="text-xs text-lens-muted mb-3">
          Build in progress... want to play while you wait?
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => handleSelect(game.id)}
              className={`group relative flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-all duration-200 hover:border-lens-accent/50 hover:bg-lens-accent/5 ${
                lastGame === game.id
                  ? "border-lens-accent/40 bg-lens-accent/5"
                  : "border-lens-border/40 bg-lens-surface2/40"
              }`}
            >
              <span className="text-2xl leading-none">{game.icon}</span>
              <span className="text-xs font-medium text-lens-text">{game.name}</span>
              <span className="text-[10px] text-lens-muted">{game.desc}</span>
              {lastGame === game.id && (
                <span className="absolute top-1.5 right-1.5 text-[9px] text-lens-accent">last</span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onDismiss}
          className="text-[11px] text-lens-muted/60 hover:text-lens-muted transition-colors"
        >
          No thanks, I&apos;ll watch the build
        </button>
      </div>
    </div>
  );
}
