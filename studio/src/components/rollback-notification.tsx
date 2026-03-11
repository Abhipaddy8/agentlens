"use client";

import { useState } from "react";

export interface RollbackMetrics {
  latency: number;
  errorRate: number;
  costDelta: number;
}

export interface RollbackResultData {
  type: "rollback-result";
  passed: boolean;
  qualityScore: number;
  threshold: number;
  oldVersion: string;
  newVersion: string;
  metrics?: RollbackMetrics;
}

interface RollbackNotificationProps {
  data: RollbackResultData;
}

export function RollbackNotification({ data }: RollbackNotificationProps) {
  const { passed, qualityScore, threshold, oldVersion, newVersion, metrics } = data;
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  if (passed) {
    return (
      <div className="rollback-notification-card mx-auto max-w-2xl my-4">
        <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 to-transparent p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
              <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-emerald-400">
                Update deployed successfully
              </h3>
              <p className="text-xs text-lens-muted">
                Shadow test passed: quality score {qualityScore}/{threshold === 100 ? 100 : 100} (threshold: {threshold}). Old version retired.
              </p>
            </div>
          </div>

          {/* Version info */}
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full bg-lens-surface2/80 border border-lens-border/40 px-2.5 py-1 text-lens-muted/60 line-through">
              {oldVersion}
            </span>
            <svg className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-400 font-medium">
              {newVersion}
            </span>
          </div>

          {/* Metrics (if available) */}
          {metrics && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MetricBox
                label="Latency"
                value={`${metrics.latency}ms`}
                positive={true}
              />
              <MetricBox
                label="Error Rate"
                value={`${metrics.errorRate}%`}
                positive={metrics.errorRate < 5}
              />
              <MetricBox
                label="Cost Delta"
                value={`${metrics.costDelta >= 0 ? "+" : ""}${metrics.costDelta}%`}
                positive={metrics.costDelta <= 0}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Failed + auto-rollback state
  return (
    <div className="rollback-notification-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-red-500/5 to-transparent p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
            <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-400">
              Update rolled back automatically
            </h3>
            <p className="text-xs text-lens-muted">
              Quality score {qualityScore}/100 (threshold: {threshold}). Previous version restored.
            </p>
          </div>
        </div>

        {/* Score bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-lens-muted mb-1">
            <span>Quality Score</span>
            <span className="text-red-400 font-medium">{qualityScore}/100</span>
          </div>
          <div className="relative h-2 rounded-full bg-lens-surface2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${qualityScore}%`,
                background: "linear-gradient(90deg, #ef4444, #f59e0b)",
              }}
            />
            {/* Threshold marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-lens-muted/60"
              style={{ left: `${threshold}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-lens-muted/50 mt-0.5">
            <span>0</span>
            <span style={{ marginLeft: `${threshold - 5}%` }}>Threshold ({threshold})</span>
            <span>100</span>
          </div>
        </div>

        {/* Version info */}
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2.5 py-1 text-red-400 line-through">
            {newVersion}
          </span>
          <svg className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-400 font-medium">
            {oldVersion} (restored)
          </span>
        </div>

        {/* Expandable details */}
        {metrics && (
          <>
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="flex items-center gap-1.5 text-[11px] text-lens-muted hover:text-lens-text transition-colors w-full"
            >
              <svg
                className={`w-3 h-3 transition-transform ${detailsExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              View Details
            </button>
            {detailsExpanded && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <MetricBox
                  label="Latency"
                  value={`${metrics.latency}ms`}
                  positive={false}
                />
                <MetricBox
                  label="Error Rate"
                  value={`${metrics.errorRate}%`}
                  positive={false}
                />
                <MetricBox
                  label="Cost Delta"
                  value={`${metrics.costDelta >= 0 ? "+" : ""}${metrics.costDelta}%`}
                  positive={false}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricBox({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-lg bg-lens-surface/80 border border-lens-border/40 p-2.5 text-center">
      <p className="text-[10px] text-lens-muted mb-0.5 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
        {value}
      </p>
    </div>
  );
}
