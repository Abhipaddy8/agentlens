"use client";

export function ThinkingIndicator() {
  return (
    <div className="flex gap-3 py-4">
      {/* Avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-lens-accent/20 text-lens-accent text-xs font-bold">
        AI
      </div>

      {/* Thinking animation */}
      <div className="flex flex-col">
        <div className="mb-1 text-xs font-medium text-lens-muted">
          Assistant
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-lens-surface2 px-4 py-2.5">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
          <span className="text-xs text-lens-muted/60 italic">Thinking...</span>
        </div>
      </div>
    </div>
  );
}
