"use client";

export type ConnectionStatus = "connected" | "failed" | "pending";

interface IntegrationStatusProps {
  service: string;
  status: ConnectionStatus;
  detail?: string;
}

export function IntegrationStatus({ service, status, detail }: IntegrationStatusProps) {
  const dotColor =
    status === "connected"
      ? "bg-emerald-400"
      : status === "failed"
      ? "bg-red-400"
      : "bg-yellow-400 animate-pulse";

  const label =
    status === "connected"
      ? "Connected"
      : status === "failed"
      ? "Failed"
      : "Connecting...";

  const textColor =
    status === "connected"
      ? "text-emerald-400"
      : status === "failed"
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-lens-border bg-lens-surface2/60 px-3 py-1.5">
      <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
      <span className={`text-xs font-medium ${textColor}`}>
        {service} {label}
      </span>
      {detail && (
        <span className="text-[10px] text-lens-muted">{detail}</span>
      )}
    </div>
  );
}
