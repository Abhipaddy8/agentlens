"use client";

import { useState, useCallback, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface AutonomyAction {
  name: string;
  label: string;
  requiresApproval: boolean;
  threshold?: number;
}

export interface AutonomyConfigData {
  type: "autonomy-config";
  agentId: string;
  actions: AutonomyAction[];
  trustLevel: number; // 0-100
}

interface AutonomyConfigProps {
  data: AutonomyConfigData;
  onSave: (agentId: string, config: { actions: AutonomyAction[]; trustLevel: number }) => void;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_ACTIONS: AutonomyAction[] = [
  { name: "send_emails", label: "Send emails", requiresApproval: true },
  { name: "update_crm", label: "Update CRM records", requiresApproval: true },
  { name: "post_slack", label: "Post to Slack", requiresApproval: false },
  { name: "query_db", label: "Query databases", requiresApproval: false },
  { name: "make_api_calls", label: "Make API calls", requiresApproval: false },
  { name: "spend_over", label: "Spend over threshold", requiresApproval: true, threshold: 1.0 },
];

const TRUST_LABELS = [
  { at: 0, label: "Conservative" },
  { at: 50, label: "Balanced" },
  { at: 100, label: "Autonomous" },
];

// ── Component ────────────────────────────────────────────────────────

export function AutonomyConfig({ data, onSave }: AutonomyConfigProps) {
  const { agentId } = data;
  const [actions, setActions] = useState<AutonomyAction[]>(
    data.actions.length > 0 ? data.actions : DEFAULT_ACTIONS
  );
  const [trustLevel, setTrustLevel] = useState(data.trustLevel);
  const [saved, setSaved] = useState(false);

  // When trust slider changes, adjust all toggles accordingly
  const handleTrustChange = useCallback((value: number) => {
    setTrustLevel(value);
    setSaved(false);

    // Conservative (0): everything requires approval
    // Autonomous (100): nothing requires approval
    // In between: proportional
    setActions((prev) =>
      prev.map((action) => ({
        ...action,
        requiresApproval: value < 50
          ? true  // Conservative side: approve everything
          : value >= 90
          ? false // Autonomous side: approve nothing
          : action.requiresApproval, // Middle: keep individual settings
      }))
    );
  }, []);

  const toggleAction = useCallback((name: string) => {
    setActions((prev) =>
      prev.map((a) =>
        a.name === name ? { ...a, requiresApproval: !a.requiresApproval } : a
      )
    );
    setSaved(false);
  }, []);

  const updateThreshold = useCallback((name: string, value: number) => {
    setActions((prev) =>
      prev.map((a) =>
        a.name === name ? { ...a, threshold: value } : a
      )
    );
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    onSave(agentId, { actions, trustLevel });
    setSaved(true);
  }, [agentId, actions, trustLevel, onSave]);

  const approvalCount = actions.filter((a) => a.requiresApproval).length;

  // Clear saved indicator after 3s
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <div className="autonomy-config-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-zinc-700/50 bg-gradient-to-b from-zinc-800 to-zinc-900 p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
            <svg className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">Autonomy Configuration</h3>
            <p className="text-[10px] text-zinc-500">
              {approvalCount} of {actions.length} actions require approval
            </p>
          </div>
        </div>

        {/* Trust level slider */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            {TRUST_LABELS.map((tl) => (
              <span
                key={tl.at}
                className={`text-[10px] font-medium transition-colors ${
                  Math.abs(trustLevel - tl.at) < 25 ? "text-amber-400" : "text-zinc-600"
                }`}
              >
                {tl.label}
              </span>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={trustLevel}
            onChange={(e) => handleTrustChange(Number(e.target.value))}
            className="autonomy-slider w-full h-2 rounded-full appearance-none cursor-pointer"
          />
        </div>

        {/* Action toggles */}
        <div className="space-y-0 mb-4">
          {actions.map((action) => (
            <div
              key={action.name}
              className="flex items-center justify-between py-2.5 px-1 border-b border-zinc-700/30 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs text-zinc-300">{action.label}</span>
                {action.name === "spend_over" && action.threshold !== undefined && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-zinc-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={action.threshold}
                      onChange={(e) => updateThreshold(action.name, Number(e.target.value))}
                      className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 outline-none focus:border-amber-500/50"
                    />
                  </div>
                )}
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => toggleAction(action.name)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                  action.requiresApproval
                    ? "bg-amber-500/40 border border-amber-500/50"
                    : "bg-zinc-700 border border-zinc-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform duration-200 ${
                    action.requiresApproval
                      ? "translate-x-4 bg-amber-400"
                      : "translate-x-0.5 bg-zinc-400"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-[10px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            Requires approval
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" />
            Autonomous
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`w-full rounded-lg py-2 text-xs font-medium transition-all duration-200 ${
            saved
              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
              : "bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 hover:border-amber-500/60"
          }`}
        >
          {saved ? (
            <span className="flex items-center justify-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          ) : (
            "Save Configuration"
          )}
        </button>
      </div>
    </div>
  );
}
