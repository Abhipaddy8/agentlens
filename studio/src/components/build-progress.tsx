"use client";

import { useEffect, useState, useRef } from "react";
import type { Mission, MissionMapData } from "@/components/mission-map-card";

interface BuildProgressProps {
  missionMap: MissionMapData;
  activeMissionIdx: number;
  activeBlockIdx: number;
  currentTask: string;
  logs: string[];
  buildComplete: boolean;
}

export function BuildProgress({
  missionMap,
  activeMissionIdx,
  activeBlockIdx,
  currentTask,
  logs,
  buildComplete,
}: BuildProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    if (buildComplete) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [buildComplete]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsExpanded]);

  const totalMissions = missionMap.missions.length;
  const completedMissions = activeMissionIdx;
  const progressPct = buildComplete
    ? 100
    : Math.round(((completedMissions + activeBlockIdx / Math.max(1, missionMap.missions[activeMissionIdx]?.blocks.length || 1)) / totalMissions) * 100);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="build-progress-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-lens-accent/30 bg-gradient-to-b from-lens-accent/5 to-transparent p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lens-accent/20">
              {buildComplete ? (
                <svg className="h-4.5 w-4.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4.5 w-4.5 text-lens-accent compile-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-lens-text">
                {buildComplete ? "Build Complete!" : `Mission ${activeMissionIdx + 1}/${totalMissions}`}
              </h3>
              <p className="text-xs text-lens-muted">
                {buildComplete
                  ? `Finished in ${formatTime(elapsed)}`
                  : missionMap.missions[activeMissionIdx]?.name || "Building..."}
              </p>
            </div>
          </div>
          <span className="text-xs text-lens-muted font-mono">{formatTime(elapsed)}</span>
        </div>

        {/* Overall progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-lens-muted mb-1">
            <span>Overall Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-lens-surface2 overflow-hidden">
            <div
              className="h-full rounded-full progress-fill"
              style={{
                width: `${progressPct}%`,
                background: buildComplete
                  ? "linear-gradient(90deg, #10b981, #34d399)"
                  : "linear-gradient(90deg, #6366f1, #818cf8)",
              }}
            />
          </div>
        </div>

        {/* Current task */}
        {!buildComplete && currentTask && (
          <div className="mb-4 flex items-center gap-2 text-xs text-lens-muted">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-lens-accent build-pulse" />
            <span className="truncate">{currentTask}</span>
          </div>
        )}

        {/* Mission status list */}
        <div className="space-y-1.5 mb-4">
          {missionMap.missions.map((mission, idx) => {
            const isDone = idx < activeMissionIdx || buildComplete;
            const isActive = idx === activeMissionIdx && !buildComplete;
            const isPending = idx > activeMissionIdx && !buildComplete;

            return (
              <div
                key={mission.number}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all ${
                  isActive
                    ? "bg-lens-accent/10 border border-lens-accent/30"
                    : "bg-transparent"
                }`}
              >
                {/* Status icon */}
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {isDone && (
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isActive && (
                    <span className="w-3 h-3 rounded-full border-2 border-lens-accent build-pulse" />
                  )}
                  {isPending && (
                    <svg className="w-3.5 h-3.5 text-lens-muted/40" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
                {/* Mission label */}
                <span className={`font-medium tabular-nums ${isDone ? "text-emerald-400" : isActive ? "text-lens-accent" : "text-lens-muted/50"}`}>
                  M{mission.number}
                </span>
                <span className={isDone ? "text-lens-muted" : isActive ? "text-lens-text" : "text-lens-muted/50"}>
                  {mission.name}
                </span>

                {/* Pipeline blocks for active mission */}
                {isActive && (
                  <div className="ml-auto flex items-center gap-1">
                    {mission.blocks.map((block, bIdx) => (
                      <span
                        key={bIdx}
                        className={`inline-block w-2 h-2 rounded-sm transition-all ${
                          bIdx < activeBlockIdx
                            ? "bg-emerald-400"
                            : bIdx === activeBlockIdx
                            ? "bg-lens-accent build-pulse"
                            : "bg-lens-muted/20"
                        }`}
                        title={block.name}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Expandable logs */}
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          className="flex items-center gap-1.5 text-[11px] text-lens-muted hover:text-lens-text transition-colors w-full"
        >
          <svg
            className={`w-3 h-3 transition-transform ${logsExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Live Log {logs.length > 0 && `(${logs.length} lines)`}
        </button>
        {logsExpanded && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-lens-surface/80 border border-lens-border/40 p-3 font-mono text-[11px] text-lens-muted leading-relaxed">
            {logs.length === 0 ? (
              <span className="text-lens-muted/40">Waiting for output...</span>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">{line}</div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
