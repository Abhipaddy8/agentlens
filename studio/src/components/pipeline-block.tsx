"use client";

type MissionType =
  | "scaffold"
  | "core-loop"
  | "data-layer"
  | "auth"
  | "ui"
  | "integration"
  | "ship";

const TYPE_COLORS: Record<MissionType, { bg: string; border: string; text: string }> = {
  scaffold:     { bg: "bg-emerald-500/10",  border: "border-emerald-500/30", text: "text-emerald-400" },
  "core-loop":  { bg: "bg-blue-500/10",     border: "border-blue-500/30",    text: "text-blue-400" },
  "data-layer": { bg: "bg-purple-500/10",   border: "border-purple-500/30",  text: "text-purple-400" },
  auth:         { bg: "bg-orange-500/10",    border: "border-orange-500/30",  text: "text-orange-400" },
  ui:           { bg: "bg-cyan-500/10",      border: "border-cyan-500/30",    text: "text-cyan-400" },
  integration:  { bg: "bg-yellow-500/10",    border: "border-yellow-500/30",  text: "text-yellow-400" },
  ship:         { bg: "bg-red-500/10",       border: "border-red-500/30",     text: "text-red-400" },
};

interface PipelineBlockProps {
  name: string;
  type?: MissionType;
  isLast?: boolean;
}

export function PipelineBlock({ name, type = "scaffold", isLast = false }: PipelineBlockProps) {
  const colors = TYPE_COLORS[type] || TYPE_COLORS.scaffold;

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight ${colors.bg} ${colors.border} ${colors.text}`}
      >
        {name}
      </span>
      {!isLast && (
        <svg
          className="h-3 w-3 text-lens-muted/50 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      )}
    </span>
  );
}

export type { MissionType };
