"use client";

import { useMemo } from "react";

interface BriefProgressProps {
  messageCount: number;
}

const PHASES = [
  { threshold: 0, percent: 0, label: "Getting started...", icon: "..." },
  { threshold: 2, percent: 25, label: "Understanding your agent...", icon: "..." },
  { threshold: 4, percent: 50, label: "Collecting integrations...", icon: "..." },
  { threshold: 6, percent: 75, label: "Finalizing details...", icon: "..." },
  { threshold: 8, percent: 100, label: "Brief complete! Ready to build.", icon: "..." },
];

function getPhase(messageCount: number) {
  // Walk backwards to find the highest matching phase
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (messageCount >= PHASES[i].threshold) {
      return PHASES[i];
    }
  }
  return PHASES[0];
}

export function BriefProgress({ messageCount }: BriefProgressProps) {
  const phase = useMemo(() => getPhase(messageCount), [messageCount]);
  const isComplete = phase.percent === 100;

  // Don't show until conversation has started
  if (messageCount === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-lens-border bg-lens-surface/80 backdrop-blur-sm">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-lens-surface2 rounded-full overflow-hidden">
          <div
            className={`progress-fill h-full rounded-full ${
              isComplete
                ? "bg-emerald-500"
                : "bg-lens-accent"
            }`}
            style={{ width: `${phase.percent}%` }}
          />
        </div>
        <span className="text-xs text-lens-muted tabular-nums w-8 text-right">
          {phase.percent}%
        </span>
      </div>

      {/* Phase label */}
      <div className="phase-label mt-1.5 flex items-center gap-2">
        {isComplete ? (
          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-lens-accent animate-pulse" />
        )}
        <span className={`text-xs ${isComplete ? "text-emerald-400 font-medium" : "text-lens-muted"}`}>
          {phase.label}
        </span>
      </div>
    </div>
  );
}
