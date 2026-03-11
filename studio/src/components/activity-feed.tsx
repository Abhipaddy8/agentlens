"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  timestamp: string;
  summary: string;
  cost: number;
  durationMs: number;
  status: "success" | "warning" | "error";
  details?: { steps: string[]; tools: string[]; tokensUsed: number };
}

export interface ActivityFeedData {
  type: "activity-feed";
  agentId: string;
  entries: ActivityEntry[];
}

interface ActivityFeedProps {
  agentId: string;
  entries: ActivityEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  success: { dot: "bg-emerald-400", ring: "ring-emerald-400/20", label: "Success" },
  warning: { dot: "bg-amber-400", ring: "ring-amber-400/20", label: "Warning" },
  error: { dot: "bg-red-400", ring: "ring-red-400/20", label: "Error" },
} as const;

function formatCost(cost: number): string {
  return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return ts;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function ActivityFeed({ agentId, entries: initialEntries }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>(initialEntries);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update entries when props change
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/activity`);
        if (res.ok) {
          const data = await res.json();
          if (data.entries) setEntries(data.entries);
        }
      } catch {
        // Silently handle polling errors
      }
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, agentId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = entries.length > visibleCount;

  return (
    <div className="activity-feed-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-zinc-700/50 bg-gradient-to-b from-zinc-800 to-zinc-900 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <svg className="h-4 w-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Recent Activity</h3>
              <p className="text-[10px] text-zinc-500">{entries.length} run{entries.length !== 1 ? "s" : ""} recorded</p>
            </div>
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              autoRefresh
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-400"
            }`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
        </div>

        {/* Entries */}
        <div className="space-y-0">
          {visibleEntries.map((entry, idx) => {
            const statusCfg = STATUS_CONFIG[entry.status];
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="activity-feed-item border-b border-zinc-700/40 last:border-b-0"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full text-left py-3 px-1 hover:bg-zinc-800/50 rounded-lg transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    {/* Status dot */}
                    <div className="mt-1.5 shrink-0">
                      <span className={`inline-block h-2 w-2 rounded-full ${statusCfg.dot} ring-2 ${statusCfg.ring}`} />
                    </div>

                    {/* Summary */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 leading-relaxed">{entry.summary}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-zinc-500">{formatTime(entry.timestamp)}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 border border-zinc-700/50">
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatCost(entry.cost)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 border border-zinc-700/50">
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatDuration(entry.durationMs)}
                        </span>
                      </div>
                    </div>

                    {/* Expand chevron */}
                    {entry.details && (
                      <svg
                        className={`h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-400 transition-transform shrink-0 mt-1 ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && entry.details && (
                  <div className="pb-3 px-1 ml-5">
                    <div className="rounded-lg bg-zinc-900/80 border border-zinc-700/40 p-3 space-y-2.5">
                      {/* Steps */}
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1">Steps</p>
                        <ol className="space-y-0.5">
                          {entry.details.steps.map((step, i) => (
                            <li key={i} className="text-[11px] text-zinc-400 flex items-start gap-1.5">
                              <span className="text-zinc-600 shrink-0">{i + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Tools */}
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1">Tools Used</p>
                        <div className="flex flex-wrap gap-1">
                          {entry.details.tools.map((tool) => (
                            <span key={tool} className="rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Tokens */}
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Tokens</p>
                        <p className="text-[11px] text-zinc-400 font-mono">{entry.details.tokensUsed.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {entries.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-zinc-500">No activity yet. Your agent will show runs here once it starts processing requests.</p>
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={() => setVisibleCount((v) => v + 10)}
            className="w-full mt-3 rounded-lg border border-zinc-700/40 bg-zinc-800/50 py-2 text-[11px] text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Load more ({entries.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
