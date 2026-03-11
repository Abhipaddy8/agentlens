"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { MissionMapCard } from "@/components/mission-map-card";
import type { MissionMapData } from "@/components/mission-map-card";

interface BriefCompleteCardProps {
  messages: Array<{ role: string; content: string }>;
  missionMap?: MissionMapData | null;
  onCompile?: () => void | Promise<void>;
  onStartBuilding?: () => void;
  onModify?: () => void;
}

export function BriefCompleteCard({
  messages,
  missionMap: externalMissionMap,
  onCompile,
  onStartBuilding,
  onModify,
}: BriefCompleteCardProps) {
  const [isCompiling, setIsCompiling] = useState(false);
  const [internalMissionMap, setInternalMissionMap] = useState<MissionMapData | null>(null);

  const missionMap = externalMissionMap || internalMissionMap;

  // Extract a summary from user messages
  const summary = useMemo(() => {
    const userMessages = messages.filter((m) => m.role === "user");
    const items: string[] = [];

    userMessages.forEach((m) => {
      const text = m.content.trim();
      if (text.length > 0) {
        items.push(text.length > 80 ? text.slice(0, 80) + "..." : text);
      }
    });

    return items.slice(0, 5);
  }, [messages]);

  // Clear compiling state when external mission map arrives
  useEffect(() => {
    if (externalMissionMap) setIsCompiling(false);
  }, [externalMissionMap]);

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);

    if (onCompile) {
      // Parent handles the streaming compile — isCompiling clears when missionMap arrives
      await onCompile();
      setIsCompiling(false);
      return;
    }

    // Fallback: call compile API with SSE stream parsing
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compile", messages }),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("2:")) {
            try {
              const events = JSON.parse(line.slice(2));
              for (const evt of events) {
                if (evt.type === "mission-map") {
                  setInternalMissionMap(evt.missionMap);
                }
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      // Silently handle
    } finally {
      setIsCompiling(false);
    }
  }, [onCompile, messages]);

  const handleStartBuilding = useCallback(() => {
    if (onStartBuilding) {
      onStartBuilding();
    }
  }, [onStartBuilding]);

  const handleModify = useCallback(() => {
    if (onModify) {
      onModify();
    }
  }, [onModify]);

  // If mission map is available, show it instead
  if (missionMap) {
    return (
      <MissionMapCard
        data={missionMap}
        onStartBuilding={handleStartBuilding}
        onModify={handleModify}
      />
    );
  }

  // Compiling state — spinner
  if (isCompiling) {
    return (
      <div className="brief-complete-card mx-auto max-w-2xl my-4">
        <div className="rounded-xl border border-lens-accent/30 bg-lens-accent/5 p-5">
          <div className="flex items-center gap-3">
            <div className="compile-spinner h-5 w-5 rounded-full border-2 border-lens-accent/30 border-t-lens-accent" />
            <div>
              <p className="text-sm font-medium text-lens-accent">
                Generating mission map...
              </p>
              <p className="text-xs text-lens-muted mt-0.5">
                Analyzing your brief and planning the build
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: brief complete, ready to compile
  return (
    <div className="brief-complete-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
            <svg
              className="h-4.5 w-4.5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
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
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-lens-text"
                >
                  <span className="text-emerald-500 mt-0.5 shrink-0">-</span>
                  <span className="break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Compile / Start Building button */}
        <button
          onClick={handleCompile}
          className="w-full rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/50 transition-all duration-200"
        >
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Start Building
          </span>
        </button>
      </div>
    </div>
  );
}
