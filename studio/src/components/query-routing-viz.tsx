"use client";

import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface RoutingDecision {
  queryPreview: string;
  route: "web" | "database" | "documents" | "api";
  confidence: number;
  passedGate: boolean;
  timestamp: string;
}

export interface RoutingVizData {
  type: "routing-viz";
  decisions: RoutingDecision[];
}

interface QueryRoutingVizProps {
  decisions: RoutingDecision[];
}

// ── Config ───────────────────────────────────────────────────────────

const ROUTE_CONFIG = {
  web: {
    label: "Web Search",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/30",
    icon: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  database: {
    label: "Database",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    icon: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
  documents: {
    label: "Documents",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    icon: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  api: {
    label: "API Call",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/30",
    icon: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
} as const;

const PIPELINE_STAGES = ["Query Classifier", "Tool Selector", "Data Source Router", "Confidence Gate"];

function confidenceColor(score: number): string {
  if (score > 0.8) return "text-emerald-400";
  if (score >= 0.5) return "text-amber-400";
  return "text-red-400";
}

function confidenceBg(score: number): string {
  if (score > 0.8) return "bg-emerald-400";
  if (score >= 0.5) return "bg-amber-400";
  return "bg-red-400";
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return ts;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function QueryRoutingViz({ decisions }: QueryRoutingVizProps) {
  const [expanded, setExpanded] = useState(false);

  // Stats
  const total = decisions.length;
  const passed = decisions.filter((d) => d.passedGate).length;
  const avgConfidence = total > 0 ? decisions.reduce((s, d) => s + d.confidence, 0) / total : 0;
  const routeCounts = decisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.route] = (acc[d.route] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="routing-viz-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-b from-zinc-800 to-zinc-900 p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20">
            <svg className="h-4 w-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Query Routing</h3>
            <p className="text-[10px] text-zinc-500">{total} decision{total !== 1 ? "s" : ""} tracked</p>
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="mb-4 rounded-lg bg-zinc-900/80 border border-zinc-700/30 p-3">
          <div className="flex items-center justify-between gap-1">
            {PIPELINE_STAGES.map((stage, idx) => (
              <div key={stage} className="flex items-center gap-1 flex-1">
                <div className="text-center flex-1">
                  <div className="rounded-md bg-zinc-800 border border-zinc-700/50 px-2 py-1.5">
                    <p className="text-[9px] text-zinc-400 font-medium whitespace-nowrap">{stage}</p>
                  </div>
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <svg className="h-3 w-3 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Route distribution summary */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {(Object.keys(ROUTE_CONFIG) as Array<keyof typeof ROUTE_CONFIG>).map((route) => {
            const cfg = ROUTE_CONFIG[route];
            const count = routeCounts[route] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={route} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-2 text-center`}>
                <div className={`flex justify-center mb-1 ${cfg.color}`}>{cfg.icon}</div>
                <p className={`text-sm font-semibold ${cfg.color}`}>{count}</p>
                <p className="text-[9px] text-zinc-500">{cfg.label} ({pct}%)</p>
              </div>
            );
          })}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-4 px-1">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Avg Confidence</p>
            <p className={`text-sm font-semibold ${confidenceColor(avgConfidence)}`}>{(avgConfidence * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Gate Pass Rate</p>
            <p className="text-sm font-semibold text-zinc-300">{total > 0 ? Math.round((passed / total) * 100) : 0}%</p>
          </div>
        </div>

        {/* Decisions table */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors w-full mb-2"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Recent Decisions
        </button>

        {expanded && (
          <div className="rounded-lg bg-zinc-900/80 border border-zinc-700/30 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-b border-zinc-700/30">
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Query</p>
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Route</p>
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Confidence</p>
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Gate</p>
            </div>

            {/* Rows */}
            {decisions.slice(0, 15).map((decision, idx) => {
              const cfg = ROUTE_CONFIG[decision.route];
              return (
                <div
                  key={idx}
                  className="routing-decision-row grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-3 py-2 border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/30 transition-colors"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  {/* Query preview */}
                  <div className="min-w-0">
                    <p className="text-[11px] text-zinc-400 truncate" title={decision.queryPreview}>
                      {decision.queryPreview}
                    </p>
                    <p className="text-[9px] text-zinc-600">{formatTime(decision.timestamp)}</p>
                  </div>

                  {/* Route badge */}
                  <span className={`inline-flex items-center gap-1 rounded-full ${cfg.bg} ${cfg.border} border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>

                  {/* Confidence */}
                  <div className="flex items-center gap-1.5 min-w-[60px]">
                    <div className="w-8 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${confidenceBg(decision.confidence)}`}
                        style={{ width: `${decision.confidence * 100}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono ${confidenceColor(decision.confidence)}`}>
                      {(decision.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Gate status */}
                  {decision.passedGate ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400">
                      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Pass
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400">
                      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Fallback
                    </span>
                  )}
                </div>
              );
            })}

            {decisions.length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-zinc-500">No routing decisions recorded yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
