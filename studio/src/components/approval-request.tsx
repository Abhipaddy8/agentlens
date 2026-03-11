"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface ApprovalRequestData {
  type: "approval-request";
  requestId: string;
  agentId: string;
  agentName: string;
  question: string;
  context: string;
  channel: "slack" | "whatsapp" | "in-app";
  timeoutSeconds: number;
  status: "waiting" | "approved" | "denied" | "expired";
  createdAt: string;
}

interface ApprovalRequestProps {
  data: ApprovalRequestData;
  onApprove: (requestId: string, note?: string) => void;
  onDeny: (requestId: string, reason?: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

const CHANNEL_CONFIG = {
  slack: {
    label: "Slack",
    color: "#E01E5A",
    icon: (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z" />
      </svg>
    ),
  },
  whatsapp: {
    label: "WhatsApp",
    color: "#25D366",
    icon: (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
      </svg>
    ),
  },
  "in-app": {
    label: "In-app only",
    color: "#6366f1",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
} as const;

const STATUS_BORDER = {
  waiting: "border-amber-500/50 approval-waiting-border",
  approved: "border-emerald-500/50 approval-approved-flash",
  denied: "border-red-500/50 approval-denied-flash",
  expired: "border-zinc-600/50",
} as const;

const STATUS_ICON_BG = {
  waiting: "bg-amber-500/20",
  approved: "bg-emerald-500/20",
  denied: "bg-red-500/20",
  expired: "bg-zinc-700",
} as const;

// ── Component ────────────────────────────────────────────────────────

export function ApprovalRequest({ data, onApprove, onDeny }: ApprovalRequestProps) {
  const { requestId, agentName, question, context, channel, timeoutSeconds, status, createdAt } = data;
  const [note, setNote] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer for waiting status
  useEffect(() => {
    if (status !== "waiting") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const createdMs = new Date(createdAt).getTime();
    const expiresMs = createdMs + timeoutSeconds * 1000;

    const tick = () => {
      const left = Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
      setRemaining(left);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, createdAt, timeoutSeconds]);

  const formatRemaining = (secs: number): string => {
    if (secs <= 0) return "Expired";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const channelCfg = CHANNEL_CONFIG[channel];

  return (
    <div className="approval-request-card mx-auto max-w-2xl my-4">
      <div className={`rounded-xl border-2 ${STATUS_BORDER[status]} bg-gradient-to-b from-zinc-800 to-zinc-900 p-5 transition-colors duration-500`}>
        {/* Header: agent name + status badge */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${STATUS_ICON_BG[status]} transition-colors duration-500`}>
            {status === "waiting" && (
              <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
            {status === "approved" && (
              <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status === "denied" && (
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {status === "expired" && (
              <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">{agentName}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                status === "waiting"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : status === "approved"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : status === "denied"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-zinc-700 text-zinc-400 border border-zinc-600"
              }`}>
                {status === "waiting" ? "Awaiting Approval" : status === "approved" ? "Approved" : status === "denied" ? "Denied" : "Expired"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 truncate">{context}</p>
          </div>
        </div>

        {/* The question — bold and prominent */}
        <div className="mb-4 rounded-lg bg-zinc-900/80 border border-zinc-700/60 p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Action Requiring Approval</p>
          <p className="text-sm font-semibold text-zinc-100 leading-relaxed">{question}</p>
        </div>

        {/* Channel notification indicator */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span style={{ color: channelCfg.color }}>{channelCfg.icon}</span>
            <span>Sent via {channelCfg.label}</span>
          </div>

          {/* Timeout indicator */}
          {status === "waiting" && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <svg className="h-3 w-3 text-amber-400/70 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                {remaining > 0 ? `Auto-deny in ${formatRemaining(remaining)}` : "Timed out"}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons — only show when waiting */}
        {status === "waiting" && (
          <div className="space-y-3">
            {/* Optional note input */}
            {showInput && (
              <div className="rounded-lg bg-zinc-900/80 border border-zinc-700/40 p-3">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add instructions or reason..."
                  className="w-full bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => onApprove(requestId, note || undefined)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/60 transition-all duration-200"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Approve
              </button>
              <button
                onClick={() => onDeny(requestId, note || undefined)}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/40 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/30 hover:border-red-500/60 transition-all duration-200"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Deny
              </button>
              <button
                onClick={() => setShowInput(!showInput)}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-all duration-200"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {showInput ? "Hide note" : "Add note"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
