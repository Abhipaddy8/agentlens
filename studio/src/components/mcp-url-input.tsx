"use client";

import { useState, useCallback } from "react";
import { IntegrationStatus } from "@/components/integration-status";
import type { ConnectionStatus } from "@/components/integration-status";

interface McpUrlInputProps {
  onConnected?: (url: string, tools: string[]) => void;
}

export function McpUrlInput({ onConnected }: McpUrlInputProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const [error, setError] = useState("");

  const isValidUrl = useCallback((value: string) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, []);

  const handleTest = useCallback(async () => {
    if (!isValidUrl(url)) {
      setError("Enter a valid HTTP/HTTPS URL");
      return;
    }

    setError("");
    setTesting(true);
    setStatus("pending");

    try {
      const res = await fetch("/api/integrations/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (res.ok) {
        const data = await res.json();
        setStatus("connected");
        setTools(data.tools || []);
        onConnected?.(url, data.tools || []);
      } else {
        setStatus("failed");
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Connection failed");
      }
    } catch {
      setStatus("failed");
      setError("Could not reach MCP server");
    } finally {
      setTesting(false);
    }
  }, [url, isValidUrl, onConnected]);

  if (status === "connected") {
    return (
      <div className="integration-prompt-card space-y-3">
        <IntegrationStatus service="MCP Server" status="connected" />
        {tools.length > 0 && (
          <div className="rounded-lg bg-lens-surface2/60 p-3">
            <p className="text-[10px] font-medium text-lens-muted uppercase tracking-wider mb-2">
              Available Tools ({tools.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center rounded-full border border-lens-accent/30 bg-lens-accent/10 px-2 py-0.5 text-[10px] font-medium text-lens-accent"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="integration-prompt-card space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lens-accent/20">
          <svg className="h-4 w-4 text-lens-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-lens-text">Connect MCP Server</h3>
          <p className="text-xs text-lens-muted">Enter your Model Context Protocol server URL</p>
        </div>
      </div>

      {/* URL Input */}
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
            setStatus(null);
          }}
          placeholder="https://your-mcp-server.com/api"
          className="flex-1 rounded-lg border border-lens-border bg-lens-surface px-3 py-2 text-sm text-lens-text placeholder:text-lens-muted/50 focus:border-lens-accent/60 focus:outline-none focus:ring-1 focus:ring-lens-accent/30 transition-colors"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleTest();
          }}
        />
        <button
          onClick={handleTest}
          disabled={testing || !url.trim()}
          className="rounded-lg bg-lens-accent/20 border border-lens-accent/40 px-4 py-2 text-sm font-medium text-lens-accent hover:bg-lens-accent/30 hover:border-lens-accent/60 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {testing ? (
            <>
              <span className="compile-spinner h-3.5 w-3.5 rounded-full border-2 border-lens-accent/30 border-t-lens-accent" />
              Testing
            </>
          ) : (
            "Connect MCP"
          )}
        </button>
      </div>

      {/* Error / Status */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {status === "failed" && !error && (
        <IntegrationStatus service="MCP Server" status="failed" />
      )}
    </div>
  );
}
