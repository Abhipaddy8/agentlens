"use client";

import { useMemo } from "react";

interface BriefCompleteCardProps {
  messages: Array<{ role: string; content: string }>;
}

export function BriefCompleteCard({ messages }: BriefCompleteCardProps) {
  // Extract a summary from user messages
  const summary = useMemo(() => {
    const userMessages = messages.filter((m) => m.role === "user");
    const items: string[] = [];

    // Pull first ~60 chars from each user message as summary bullets
    userMessages.forEach((m, i) => {
      const text = m.content.trim();
      if (text.length > 0) {
        items.push(
          text.length > 80 ? text.slice(0, 80) + "..." : text
        );
      }
    });

    return items.slice(0, 5); // max 5 bullet points
  }, [messages]);

  return (
    <div className="brief-complete-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
            <svg className="h-4.5 w-4.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-400">
              Brief Complete
            </h3>
            <p className="text-xs text-lens-muted">
              All details collected. Ready to build your agent.
            </p>
          </div>
        </div>

        {/* Collected items */}
        {summary.length > 0 && (
          <div className="mb-4 rounded-lg bg-lens-surface2/60 p-3">
            <p className="text-xs font-medium text-lens-muted mb-2 uppercase tracking-wider">
              Collected
            </p>
            <ul className="space-y-1.5">
              {summary.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-lens-text">
                  <span className="text-emerald-500 mt-0.5 shrink-0">-</span>
                  <span className="break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Start Building button */}
        <button
          disabled
          className="w-full rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-not-allowed opacity-70"
          title="Coming in M21"
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Start Building
          </span>
        </button>
      </div>
    </div>
  );
}
