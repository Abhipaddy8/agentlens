"use client";

import { useEffect, useState, useRef } from "react";

export interface DeployStep {
  label: string;
  status: "pending" | "in-progress" | "complete" | "failed";
}

export interface DeployProgressData {
  type: "deploy-progress";
  steps: DeployStep[];
  estimatedSecondsRemaining?: number;
}

interface DeployProgressProps {
  data: DeployProgressData;
}

const DEFAULT_STEPS: DeployStep[] = [
  { label: "Provisioning Lambda...", status: "pending" },
  { label: "Wiring triggers...", status: "pending" },
  { label: "Connecting integrations...", status: "pending" },
  { label: "Auto-wiring proxy...", status: "pending" },
  { label: "Registering in dashboard...", status: "pending" },
  { label: "Running health check...", status: "pending" },
];

export function DeployProgress({ data }: DeployProgressProps) {
  const steps = data.steps.length > 0 ? data.steps : DEFAULT_STEPS;
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const totalSteps = steps.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);
  const isFinished = completedCount + failedCount === totalSteps;

  useEffect(() => {
    if (isFinished) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isFinished]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="deploy-progress-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-b from-blue-500/5 to-transparent p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
              {isFinished && failedCount === 0 ? (
                <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : isFinished && failedCount > 0 ? (
                <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-blue-400 compile-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-lens-text">
                {isFinished && failedCount === 0
                  ? "Deploy Complete"
                  : isFinished && failedCount > 0
                  ? "Deploy Failed"
                  : "Deploying Agent..."}
              </h3>
              <p className="text-xs text-lens-muted">
                {isFinished
                  ? `Finished in ${formatTime(elapsed)}`
                  : `Step ${completedCount + 1} of ${totalSteps}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-lens-muted font-mono">{formatTime(elapsed)}</span>
            {!isFinished && data.estimatedSecondsRemaining != null && (
              <p className="text-[10px] text-lens-muted/60">
                ~{formatTime(data.estimatedSecondsRemaining)} remaining
              </p>
            )}
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-lens-muted mb-1">
            <span>Deploy Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-lens-surface2 overflow-hidden">
            <div
              className="h-full rounded-full progress-fill"
              style={{
                width: `${progressPct}%`,
                background:
                  failedCount > 0
                    ? "linear-gradient(90deg, #ef4444, #f87171)"
                    : isFinished
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #3b82f6, #60a5fa)",
              }}
            />
          </div>
        </div>

        {/* Steps list */}
        <div className="space-y-1.5">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all ${
                step.status === "in-progress"
                  ? "bg-blue-500/10 border border-blue-500/30"
                  : "bg-transparent"
              }`}
            >
              {/* Status icon */}
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {step.status === "complete" && (
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {step.status === "in-progress" && (
                  <span className="w-3 h-3 rounded-full border-2 border-blue-400 build-pulse" />
                )}
                {step.status === "pending" && (
                  <span className="w-2.5 h-2.5 rounded-full bg-lens-muted/20" />
                )}
                {step.status === "failed" && (
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </span>
              {/* Step label */}
              <span
                className={`font-medium ${
                  step.status === "complete"
                    ? "text-emerald-400"
                    : step.status === "in-progress"
                    ? "text-blue-400"
                    : step.status === "failed"
                    ? "text-red-400"
                    : "text-lens-muted/50"
                }`}
              >
                {step.label}
              </span>
              {/* Spinner for in-progress */}
              {step.status === "in-progress" && (
                <span className="ml-auto compile-spinner h-3 w-3 rounded-full border-2 border-blue-400/30 border-t-blue-400" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
