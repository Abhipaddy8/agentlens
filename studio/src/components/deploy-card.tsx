"use client";

import { useState } from "react";

export interface DeployCompleteData {
  type: "deploy-complete";
  agentName: string;
  endpointUrl: string;
  deployedAt: string;
  integrations: string[];
  dashboardUrl?: string;
}

interface DeployCardProps {
  data: DeployCompleteData;
}

const INTEGRATION_ICONS: Record<string, { color: string; label: string }> = {
  hubspot: { color: "#FF7A59", label: "HubSpot" },
  slack: { color: "#E01E5A", label: "Slack" },
  google: { color: "#4285F4", label: "Google" },
  salesforce: { color: "#00A1E0", label: "Salesforce" },
  stripe: { color: "#635BFF", label: "Stripe" },
  github: { color: "#8b949e", label: "GitHub" },
  notion: { color: "#FFFFFF", label: "Notion" },
};

export function DeployCard({ data }: DeployCardProps) {
  const { agentName, endpointUrl, deployedAt, integrations, dashboardUrl } = data;
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedTime = (() => {
    try {
      return new Date(deployedAt).toLocaleString();
    } catch {
      return deployedAt;
    }
  })();

  return (
    <div className="deploy-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-zinc-800 to-zinc-900 p-5">
        {/* Header: Agent name + live indicator */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
            <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-lens-text">{agentName}</h3>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            </div>
            <p className="text-xs text-lens-muted">Deployed {formattedTime}</p>
          </div>
        </div>

        {/* Endpoint URL */}
        <div className="mb-4 rounded-lg bg-lens-surface/80 border border-lens-border/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-lens-muted mb-1 uppercase tracking-wider font-medium">Endpoint</p>
              <p className="text-xs text-emerald-400 font-mono truncate">{endpointUrl}</p>
            </div>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 rounded-md border border-lens-border px-2 py-1.5 text-[11px] text-lens-muted hover:text-lens-text hover:border-lens-border/80 transition-colors"
            >
              {copied ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Connected integrations */}
        {integrations.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-lens-muted mb-2 uppercase tracking-wider font-medium">Connected Integrations</p>
            <div className="flex flex-wrap gap-2">
              {integrations.map((integration) => {
                const config = INTEGRATION_ICONS[integration.toLowerCase()];
                const label = config?.label || integration;
                const dotColor = config?.color || "#6366f1";
                return (
                  <span
                    key={integration}
                    className="flex items-center gap-1.5 rounded-full bg-lens-surface2/80 border border-lens-border/40 px-2.5 py-1 text-[11px] text-lens-muted"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mb-3">
          {dashboardUrl && (
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-lens-accent/20 border border-lens-accent/40 px-4 py-2 text-xs font-medium text-lens-accent hover:bg-lens-accent/30 hover:border-lens-accent/60 transition-all duration-200"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View in Dashboard
            </a>
          )}
        </div>

        {/* Activity feed placeholder */}
        <button
          onClick={() => setActivityExpanded(!activityExpanded)}
          className="flex items-center gap-1.5 text-[11px] text-lens-muted hover:text-lens-text transition-colors w-full"
        >
          <svg
            className={`w-3 h-3 transition-transform ${activityExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Activity Feed
        </button>
        {activityExpanded && (
          <div className="mt-2 rounded-lg bg-lens-surface/80 border border-lens-border/40 p-4 text-center">
            <p className="text-xs text-lens-muted/60">
              Activity feed will appear here once your agent starts processing requests.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
