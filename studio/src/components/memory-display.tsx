"use client";

import { useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
}

export interface LearningItem {
  id: string;
  content: string;
  learnedAt: string;
  sourceRunId?: string;
}

export interface MemoryDisplayData {
  type: "memory-display";
  agentId: string;
  memories: MemoryItem[];
  learnings: LearningItem[];
}

interface MemoryDisplayProps {
  agentId: string;
  memories: MemoryItem[];
  learnings: LearningItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function importanceColor(score: number): string {
  if (score >= 0.8) return "bg-emerald-400";
  if (score >= 0.5) return "bg-amber-400";
  return "bg-zinc-500";
}

function importanceBg(score: number): string {
  if (score >= 0.8) return "bg-emerald-400/10";
  if (score >= 0.5) return "bg-amber-400/10";
  return "bg-zinc-500/10";
}

function relativeTime(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return ts;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function MemoryDisplay({ agentId, memories, learnings }: MemoryDisplayProps) {
  const [localMemories, setLocalMemories] = useState<MemoryItem[]>(memories);
  const [teachInput, setTeachInput] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);

  const handleForget = useCallback(async (memoryId: string) => {
    setForgetting(memoryId);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/${memoryId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLocalMemories((prev) => prev.filter((m) => m.id !== memoryId));
      }
    } catch {
      // Silently handle
    } finally {
      setForgetting(null);
    }
  }, [agentId]);

  const handleTeach = useCallback(async () => {
    if (!teachInput.trim()) return;
    setTeaching(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: teachInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.memory) {
          setLocalMemories((prev) => [data.memory, ...prev].slice(0, 10));
        }
        setTeachInput("");
      }
    } catch {
      // Silently handle
    } finally {
      setTeaching(false);
    }
  }, [agentId, teachInput]);

  const sortedMemories = [...localMemories].sort((a, b) => b.importance - a.importance).slice(0, 10);

  return (
    <div className="memory-display-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-violet-500/20 bg-gradient-to-b from-zinc-800 to-zinc-900 p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
            <svg className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">What It Remembers</h3>
            <p className="text-[10px] text-zinc-500">{sortedMemories.length} active memories</p>
          </div>
        </div>

        {/* Active Memories */}
        {sortedMemories.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Active Memories</p>
            <div className="space-y-1.5">
              {sortedMemories.map((mem, idx) => (
                <div
                  key={mem.id}
                  className="memory-item group rounded-lg border border-zinc-700/40 bg-zinc-900/60 p-3 hover:border-zinc-600/50 transition-colors"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {/* Importance bar */}
                    <div className="mt-1 shrink-0 w-1 h-8 rounded-full overflow-hidden bg-zinc-800">
                      <div
                        className={`w-full rounded-full transition-all ${importanceColor(mem.importance)}`}
                        style={{ height: `${mem.importance * 100}%` }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 leading-relaxed">{mem.content}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${importanceBg(mem.importance)} ${mem.importance >= 0.8 ? "text-emerald-400" : mem.importance >= 0.5 ? "text-amber-400" : "text-zinc-500"}`}>
                          {(mem.importance * 10).toFixed(0)}/10
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          accessed {relativeTime(mem.lastAccessed)}
                        </span>
                      </div>
                    </div>

                    {/* Forget button */}
                    <button
                      onClick={() => handleForget(mem.id)}
                      disabled={forgetting === mem.id}
                      className="opacity-0 group-hover:opacity-100 shrink-0 rounded-md p-1 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                      title="Forget this memory"
                    >
                      {forgetting === mem.id ? (
                        <span className="compile-spinner inline-block h-3 w-3 rounded-full border border-current/30 border-t-current" />
                      ) : (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Learnings */}
        {learnings.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Recent Learnings</p>
            <div className="space-y-1.5">
              {learnings.slice(0, 5).map((learning, idx) => (
                <div
                  key={learning.id}
                  className="memory-item flex items-start gap-2.5 rounded-lg border border-zinc-700/30 bg-zinc-900/40 p-2.5"
                  style={{ animationDelay: `${(sortedMemories.length + idx) * 50}ms` }}
                >
                  <div className="mt-0.5 shrink-0">
                    <svg className="h-3 w-3 text-amber-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      <span className="text-amber-400/80 font-medium">Learned:</span>{" "}
                      {learning.content}
                    </p>
                    <span className="text-[10px] text-zinc-600">{relativeTime(learning.learnedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teach input */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Teach Something New</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={teachInput}
              onChange={(e) => setTeachInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTeach();
              }}
              placeholder="Type something for your agent to remember..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-colors"
            />
            <button
              onClick={handleTeach}
              disabled={teaching || !teachInput.trim()}
              className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-xs font-medium text-violet-400 hover:bg-violet-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {teaching ? (
                <span className="compile-spinner h-3 w-3 rounded-full border-2 border-current/30 border-t-current" />
              ) : (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
              Teach
            </button>
          </div>
        </div>

        {/* Empty state */}
        {sortedMemories.length === 0 && learnings.length === 0 && (
          <div className="text-center py-4 mb-3">
            <p className="text-xs text-zinc-500">No memories yet. Your agent will build context as it runs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
