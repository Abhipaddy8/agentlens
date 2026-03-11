"use client";

import type { Conversation } from "@/app/page";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggle: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  isOpen,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="flex w-64 flex-col border-r border-lens-border bg-lens-surface h-screen shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-lens-border">
        <h1 className="text-sm font-semibold tracking-wide text-lens-accent">
          AgentLens Studio
        </h1>
      </div>

      {/* New Chat button */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 rounded-lg border border-lens-border px-3 py-2.5 text-sm text-lens-text hover:bg-lens-surface2 transition-colors"
        >
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-lens-muted">
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center rounded-lg px-3 py-2 mb-0.5 cursor-pointer text-sm transition-colors ${
              conv.id === activeId
                ? "bg-lens-surface2 text-white"
                : "text-lens-muted hover:bg-lens-surface2/50 hover:text-lens-text"
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <svg
              className="mr-2 h-4 w-4 shrink-0 opacity-60"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <span className="truncate flex-1">{conv.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-lens-muted hover:text-red-400 transition-opacity"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-lens-border p-3">
        <div className="flex items-center gap-2 text-xs text-lens-muted">
          <div className="h-2 w-2 rounded-full bg-green-500/80"></div>
          <span>AgentLens Proxy Connected</span>
        </div>
      </div>
    </aside>
  );
}
