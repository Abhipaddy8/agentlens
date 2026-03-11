"use client";

import { useState, useCallback } from "react";

export interface DeployConfig {
  agentName: string;
  triggerType: "webhook" | "cron" | "manual";
  integrations: string[];
  estimatedMonthlyCost: string;
}

interface DeployButtonProps {
  config: DeployConfig;
  onDeploy: () => void;
}

export function DeployButton({ config, onDeploy }: DeployButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = useCallback(() => {
    setDeploying(true);
    onDeploy();
    // The parent will handle closing / transitioning to deploy-progress
    setTimeout(() => {
      setShowModal(false);
      setDeploying(false);
    }, 500);
  }, [onDeploy]);

  const triggerLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    webhook: {
      label: "Webhook",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    cron: {
      label: "Scheduled (Cron)",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    manual: {
      label: "Manual",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      ),
    },
  };

  const trigger = triggerLabels[config.triggerType] || triggerLabels.manual;

  return (
    <>
      {/* Deploy button */}
      <div className="deploy-button-card mx-auto max-w-2xl my-4">
        <button
          onClick={() => setShowModal(true)}
          className="w-full rounded-xl border border-emerald-500/40 px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:border-emerald-400/60 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)",
          }}
        >
          <span className="flex items-center justify-center gap-2.5">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Deploy Agent
          </span>
        </button>
      </div>

      {/* Confirmation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deploying && setShowModal(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 rounded-2xl border border-lens-border bg-gradient-to-b from-zinc-800 to-zinc-900 p-6 shadow-2xl deploy-modal-enter">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-lens-text">Deploy Agent</h3>
                <p className="text-xs text-lens-muted">Review before going live</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3 mb-6">
              {/* Agent name */}
              <div className="flex items-center justify-between rounded-lg bg-lens-surface/80 border border-lens-border/40 px-3 py-2.5">
                <span className="text-xs text-lens-muted">Agent</span>
                <span className="text-sm font-medium text-lens-text">{config.agentName}</span>
              </div>

              {/* Trigger */}
              <div className="flex items-center justify-between rounded-lg bg-lens-surface/80 border border-lens-border/40 px-3 py-2.5">
                <span className="text-xs text-lens-muted">Trigger</span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-lens-text">
                  {trigger.icon}
                  {trigger.label}
                </span>
              </div>

              {/* Integrations */}
              {config.integrations.length > 0 && (
                <div className="rounded-lg bg-lens-surface/80 border border-lens-border/40 px-3 py-2.5">
                  <span className="text-xs text-lens-muted block mb-1.5">Integrations</span>
                  <div className="flex flex-wrap gap-1.5">
                    {config.integrations.map((int) => (
                      <span
                        key={int}
                        className="rounded-full bg-lens-surface2/80 border border-lens-border/40 px-2 py-0.5 text-[11px] text-lens-muted"
                      >
                        {int}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost */}
              <div className="flex items-center justify-between rounded-lg bg-lens-surface/80 border border-lens-border/40 px-3 py-2.5">
                <span className="text-xs text-lens-muted">Est. Monthly Cost</span>
                <span className="text-sm font-medium text-emerald-400">{config.estimatedMonthlyCost}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/10 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: deploying
                    ? "linear-gradient(135deg, #374151 0%, #4b5563 100%)"
                    : "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                }}
              >
                {deploying ? (
                  <>
                    <span className="compile-spinner h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Deploy
                  </>
                )}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={deploying}
                className="rounded-lg border border-lens-border px-4 py-2.5 text-sm font-medium text-lens-muted hover:text-lens-text hover:border-lens-border/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
