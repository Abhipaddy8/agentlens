"use client";

import { useRef, useEffect } from "react";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ChatInput({ input, isLoading, onChange, onSubmit }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  }

  return (
    <div className="border-t border-lens-border px-4 py-3 shrink-0">
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border border-lens-border bg-lens-surface px-4 py-3 focus-within:border-lens-accent/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-lens-text placeholder:text-lens-muted/60 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lens-accent text-white transition-colors hover:bg-lens-accent-hover disabled:opacity-30 disabled:hover:bg-lens-accent"
          >
            {isLoading ? (
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-lens-muted/50">
          Messages are routed through AgentLens proxy. Costs and tokens are tracked automatically.
        </p>
      </form>
    </div>
  );
}
