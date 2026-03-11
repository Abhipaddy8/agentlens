"use client";

import { useState, useCallback } from "react";
import type { GameChoice } from "@/components/game-selector";
import { Tetris } from "@/components/games/tetris";
import { Snake } from "@/components/games/snake";
import { PacMan } from "@/components/games/pacman";

interface GameWrapperProps {
  game: GameChoice;
  paused: boolean;
  buildComplete: boolean;
  onSwitchGame: () => void;
  onClose: () => void;
}

export function GameWrapper({ game, paused, buildComplete, onSwitchGame, onClose }: GameWrapperProps) {
  const [showCelebration, setShowCelebration] = useState(false);

  // Trigger celebration when build completes
  if (buildComplete && !showCelebration) {
    setShowCelebration(true);
  }

  const renderGame = useCallback(() => {
    switch (game) {
      case "tetris": return <Tetris paused={paused || buildComplete} />;
      case "snake":  return <Snake paused={paused || buildComplete} />;
      case "pacman": return <PacMan paused={paused || buildComplete} />;
    }
  }, [game, paused, buildComplete]);

  return (
    <div className="game-wrapper mx-auto max-w-2xl my-3">
      <div className="rounded-xl border border-lens-border/50 bg-lens-surface/60 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-lens-text capitalize">{game}</span>
            {paused && !buildComplete && (
              <span className="text-[10px] text-lens-accent bg-lens-accent/10 px-1.5 py-0.5 rounded">
                paused - system message
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchGame}
              className="text-[11px] text-lens-muted hover:text-lens-text transition-colors"
            >
              Switch Game
            </button>
            <button
              onClick={onClose}
              className="text-[11px] text-lens-muted hover:text-lens-text transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Game canvas */}
        <div className="relative flex justify-center">
          {renderGame()}

          {/* Celebration overlay */}
          {showCelebration && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none build-celebration">
              <div className="text-center pointer-events-auto">
                <div className="text-3xl mb-2 celebration-bounce">
                  <svg className="h-12 w-12 mx-auto text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-emerald-400">Your agent is ready!</p>
                <p className="text-xs text-lens-muted mt-1">Build completed successfully</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
