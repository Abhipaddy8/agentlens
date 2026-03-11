"use client";

import { useState, useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface ApprovalHistoryEntry {
  requestId: string;
  action: string;
  decision: "approved" | "denied" | "expired";
  responseTimeMs: number;
  decidedBy: string;
  timestamp: string;
  note?: string;
}

export interface ApprovalHistoryData {
  type: "approval-history";
  entries: ApprovalHistoryEntry[];
}

interface ApprovalHistoryProps {
  data: ApprovalHistoryData;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DECISION_CONFIG = {
  approved: { dot: "bg-emerald-400", text: "text-emerald-400", label: "Approved" },
  denied: { dot: "bg-red-400", text: "text-red-400", label: "Denied" },
  expired: { dot: "bg-zinc-500", text: "text-zinc-500", label: "Expired" },
} as const;

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function ApprovalHistory({ data }: ApprovalHistoryProps) {
  const { entries } = data;
  const [filter, setFilter] = useState<"all" | "approved" | "denied" | "expired">("all");
  const [visibleCount, setVisibleCount] = useState(10);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.decision === filter);
  }, [entries, filter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  // Compute trust trend (compare last 7 days vs previous 7 days)
  const trend = useMemo(() => {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const thisWeek = entries.filter((e) => now - new Date(e.timestamp).getTime() < oneWeek);
    const lastWeek = entries.filter(
      (e) => {
        const age = now - new Date(e.timestamp).getTime();
        return age >= oneWeek && age < oneWeek * 2;
      }
    );

    if (lastWeek.length === 0 && thisWeek.length === 0) return null;

    const diff = lastWeek.length - thisWeek.length;
    if (diff > 0) {
      return { direction: "down" as const, count: diff };
    } else if (diff < 0) {
      return { direction: "up" as const, count: Math.abs(diff) };
    }
    return null;
  }, [entries]);

  return (
    <div className="approval-history-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-zinc-700/50 bg-gradient-to-b from-zinc-800 to-zinc-900 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <svg className="h-4 w-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Approval History</h3>
              <p className="text-[10px] text-zinc-500">{entries.length} decision{entries.length !== 1 ? "s" : ""} recorded</p>
            </div>
          </div>
        </div>

        {/* Trust trend insight */}
        {trend && (
          <div className="mb-4 rounded-lg bg-zinc-900/80 border border-zinc-700/40 px-3 py-2">
            <p className="text-[11px] text-zinc-400">
              {trend.direction === "down" ? (
                <>
                  <span className="text-emerald-400 font-medium">Trust expanding</span>
                  {" "}&mdash; {trend.count} fewer approval{trend.count !== 1 ? "s" : ""} needed this week vs last
                </>
              ) : (
                <>
                  <span className="text-amber-400 font-medium">More oversight</span>
                  {" "}&mdash; {trend.count} more approval{trend.count !== 1 ? "s" : ""} this week vs last
                </>
              )}
            </p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1.5 mb-3">
          {(["all", "approved", "denied", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setVisibleCount(10); }}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                filter === f
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-400"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Entries */}
        <div className="space-y-0">
          {visible.map((entry, idx) => {
            const cfg = DECISION_CONFIG[entry.decision];
            return (
              <div
                key={entry.requestId}
                className="approval-history-row flex items-start gap-3 py-2.5 px-1 border-b border-zinc-700/30 last:border-b-0"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                {/* Decision dot */}
                <div className="mt-1.5 shrink-0">
                  <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 leading-relaxed">{entry.action}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-zinc-500">{formatTime(entry.timestamp)}</span>
                    <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
                    <span className="text-[10px] text-zinc-600">in {formatResponseTime(entry.responseTimeMs)}</span>
                    <span className="text-[10px] text-zinc-600">by {entry.decidedBy}</span>
                  </div>
                  {entry.note && (
                    <p className="text-[10px] text-zinc-500 italic mt-1">&ldquo;{entry.note}&rdquo;</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-zinc-500">
              {filter === "all"
                ? "No approval decisions yet."
                : `No ${filter} decisions found.`}
            </p>
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={() => setVisibleCount((v) => v + 10)}
            className="w-full mt-3 rounded-lg border border-zinc-700/40 bg-zinc-800/50 py-2 text-[11px] text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
