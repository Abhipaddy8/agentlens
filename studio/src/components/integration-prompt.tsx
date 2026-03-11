"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { IntegrationStatus } from "@/components/integration-status";
import { McpUrlInput } from "@/components/mcp-url-input";
import type { ConnectionStatus } from "@/components/integration-status";

// ── Service definitions ──────────────────────────────────────────────

type IntegrationMode = "oauth" | "apikey" | "mcp";

interface ServiceConfig {
  label: string;
  color: string;
  hoverColor: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
}

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  hubspot: {
    label: "HubSpot",
    color: "text-[#FF7A59]",
    hoverColor: "hover:bg-[#FF7A59]/30",
    borderColor: "border-[#FF7A59]/40",
    bgColor: "bg-[#FF7A59]/20",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.002 8.504V5.658a1.886 1.886 0 001.082-1.7 1.895 1.895 0 00-1.89-1.89 1.895 1.895 0 00-1.89 1.89c0 .724.41 1.352 1.012 1.67v2.876a5.43 5.43 0 00-2.454 1.196L6.47 5.404a2.17 2.17 0 00.084-.578A2.15 2.15 0 004.4 2.672a2.15 2.15 0 00-2.154 2.154A2.15 2.15 0 004.4 6.98a2.13 2.13 0 001.2-.37l6.316 4.264A5.44 5.44 0 0011.1 13.4c0 .954.248 1.85.682 2.632l-2.016 2.016a1.655 1.655 0 00-.488-.078 1.66 1.66 0 00-1.66 1.66 1.66 1.66 0 001.66 1.66 1.66 1.66 0 001.66-1.66c0-.172-.028-.338-.078-.494l1.982-1.982A5.46 5.46 0 0016.306 18.9a5.478 5.478 0 005.466-5.466 5.478 5.478 0 00-4.77-5.43zm-.696 8.51a3.147 3.147 0 01-3.152-3.152 3.147 3.147 0 013.152-3.152 3.147 3.147 0 013.152 3.152 3.147 3.147 0 01-3.152 3.152z" />
      </svg>
    ),
  },
  slack: {
    label: "Slack",
    color: "text-[#4A154B]",
    hoverColor: "hover:bg-[#E01E5A]/30",
    borderColor: "border-[#E01E5A]/40",
    bgColor: "bg-[#E01E5A]/20",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z" />
      </svg>
    ),
  },
  google: {
    label: "Google",
    color: "text-[#4285F4]",
    hoverColor: "hover:bg-[#4285F4]/30",
    borderColor: "border-[#4285F4]/40",
    bgColor: "bg-[#4285F4]/20",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
  salesforce: {
    label: "Salesforce",
    color: "text-[#00A1E0]",
    hoverColor: "hover:bg-[#00A1E0]/30",
    borderColor: "border-[#00A1E0]/40",
    bgColor: "bg-[#00A1E0]/20",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.857 3.68 2.124a5.16 5.16 0 012.238-.51c2.848 0 5.156 2.312 5.156 5.165 0 2.852-2.308 5.164-5.156 5.164a5.13 5.13 0 01-1.448-.208 3.89 3.89 0 01-3.498 2.18 3.877 3.877 0 01-1.866-.477 4.39 4.39 0 01-3.83 2.273 4.396 4.396 0 01-4.106-2.828 4.38 4.38 0 01-.59.04C1.336 17.032 0 15.07 0 12.93c0-2.14 1.504-3.936 3.478-4.096a4.946 4.946 0 01-.144-1.17c0-2.73 2.213-4.944 4.943-4.944 1.8 0 3.372.963 4.236 2.402l-2.507.293z" />
      </svg>
    ),
  },
};

// Fallback for unknown services
const DEFAULT_CONFIG: ServiceConfig = {
  label: "Service",
  color: "text-lens-accent",
  hoverColor: "hover:bg-lens-accent/30",
  borderColor: "border-lens-accent/40",
  bgColor: "bg-lens-accent/20",
  icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
};

// ── Props ────────────────────────────────────────────────────────────

export interface IntegrationPromptData {
  type: "integration-prompt";
  service: string;
  mode: IntegrationMode;
  detected_keyword: string;
}

interface IntegrationPromptProps {
  data: IntegrationPromptData;
}

// ── Component ────────────────────────────────────────────────────────

export function IntegrationPrompt({ data }: IntegrationPromptProps) {
  const { service, mode, detected_keyword } = data;
  const config = SERVICE_CONFIGS[service.toLowerCase()] || {
    ...DEFAULT_CONFIG,
    label: detected_keyword || service,
  };

  if (mode === "mcp") {
    return (
      <div className="integration-prompt-card mx-auto max-w-2xl my-4">
        <div className="rounded-xl border border-lens-accent/30 bg-gradient-to-b from-lens-accent/5 to-transparent p-5">
          <McpUrlInput />
        </div>
      </div>
    );
  }

  if (mode === "oauth") {
    return (
      <div className="integration-prompt-card mx-auto max-w-2xl my-4">
        <div className="rounded-xl border border-lens-border bg-gradient-to-b from-lens-surface2/80 to-transparent p-5">
          <OAuthPrompt service={service} config={config} keyword={detected_keyword} />
        </div>
      </div>
    );
  }

  return (
    <div className="integration-prompt-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-lens-border bg-gradient-to-b from-lens-surface2/80 to-transparent p-5">
        <ApiKeyPrompt service={service} config={config} keyword={detected_keyword} />
      </div>
    </div>
  );
}

// ── OAuth Sub-Component ──────────────────────────────────────────────

function OAuthPrompt({
  service,
  config,
  keyword,
}: {
  service: string;
  config: ServiceConfig;
  keyword: string;
}) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Listen for postMessage from OAuth callback
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-callback" && event.data?.service === service) {
        if (event.data.success) {
          setStatus("connected");
        } else {
          setStatus("failed");
        }
        setConnecting(false);
        popupRef.current?.close();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [service]);

  const handleConnect = useCallback(() => {
    setConnecting(true);
    setStatus("pending");
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    popupRef.current = window.open(
      `/api/integrations/${service}/auth`,
      `oauth-${service}`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    // Fallback: if popup is closed without message, reset after 60s
    const fallback = setTimeout(() => {
      if (connecting) {
        setConnecting(false);
        setStatus(null);
      }
    }, 60000);

    return () => clearTimeout(fallback);
  }, [service, connecting]);

  if (status === "connected") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bgColor} ${config.color}`}>
            {config.icon}
          </div>
          <IntegrationStatus service={config.label} status="connected" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with context */}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bgColor} ${config.color}`}>
          {config.icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-lens-text">
            Connect {config.label}
          </h3>
          <p className="text-xs text-lens-muted">
            You mentioned &ldquo;{keyword}&rdquo; &mdash; connect to enable this integration
          </p>
        </div>
      </div>

      {/* OAuth button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        className={`w-full flex items-center justify-center gap-2.5 rounded-lg border ${config.borderColor} ${config.bgColor} px-4 py-3 text-sm font-medium ${config.color} ${config.hoverColor} transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {connecting ? (
          <>
            <span className="compile-spinner h-4 w-4 rounded-full border-2 border-current/30 border-t-current" />
            Waiting for authorization...
          </>
        ) : (
          <>
            {config.icon}
            Connect {config.label}
          </>
        )}
      </button>

      {status === "failed" && (
        <div className="flex items-center gap-2">
          <IntegrationStatus service={config.label} status="failed" />
          <button
            onClick={handleConnect}
            className="text-xs text-lens-accent hover:text-lens-accent-hover transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ── API Key Sub-Component ────────────────────────────────────────────

function ApiKeyPrompt({
  service,
  config,
  keyword,
}: {
  service: string;
  config: ServiceConfig;
  keyword: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSubmitting(true);
    setError("");
    setStatus("pending");

    try {
      const res = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, apiKey }),
      });

      if (res.ok) {
        setStatus("connected");
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("failed");
        setError(data.error || "Invalid API key");
      }
    } catch {
      setStatus("failed");
      setError("Connection failed");
    } finally {
      setSubmitting(false);
    }
  }, [apiKey, service]);

  if (status === "connected") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bgColor} ${config.color}`}>
            {config.icon}
          </div>
          <IntegrationStatus service={config.label} status="connected" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bgColor} ${config.color}`}>
          {config.icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-lens-text">
            Connect {config.label}
          </h3>
          <p className="text-xs text-lens-muted">
            You mentioned &ldquo;{keyword}&rdquo; &mdash; enter your API key to connect
          </p>
        </div>
      </div>

      {/* API Key input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError("");
              setStatus(null);
            }}
            placeholder={`Enter ${config.label} API Key`}
            className="w-full rounded-lg border border-lens-border bg-lens-surface px-3 py-2 pr-9 text-sm text-lens-text placeholder:text-lens-muted/50 focus:border-lens-accent/60 focus:outline-none focus:ring-1 focus:ring-lens-accent/30 transition-colors font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
          {/* Visibility toggle */}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-lens-muted hover:text-lens-text transition-colors"
            tabIndex={-1}
          >
            {visible ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || !apiKey.trim()}
          className={`rounded-lg border ${config.borderColor} ${config.bgColor} px-4 py-2 text-sm font-medium ${config.color} ${config.hoverColor} transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0`}
        >
          {submitting ? (
            <>
              <span className="compile-spinner h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current" />
              Verifying
            </>
          ) : (
            "Connect"
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {status === "failed" && !error && (
        <IntegrationStatus service={config.label} status="failed" />
      )}
    </div>
  );
}
