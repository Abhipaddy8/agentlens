"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";

interface ChatAreaProps {
  conversationId: string | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => string;
  onUpdateTitle: (id: string, title: string) => void;
}

export function ChatArea({
  conversationId,
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  onUpdateTitle,
}: ChatAreaProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } =
    useChat({
      api: "/api/chat",
      id: conversationId || undefined,
    });

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasSetTitle = useRef<Set<string>>(new Set());

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clear messages when switching conversations
  useEffect(() => {
    setMessages([]);
  }, [conversationId, setMessages]);

  // Auto-title: set conversation title from first user message
  useEffect(() => {
    if (
      conversationId &&
      messages.length >= 1 &&
      !hasSetTitle.current.has(conversationId)
    ) {
      const firstUserMsg = messages.find((m) => m.role === "user");
      if (firstUserMsg) {
        const title =
          firstUserMsg.content.length > 40
            ? firstUserMsg.content.slice(0, 40) + "..."
            : firstUserMsg.content;
        onUpdateTitle(conversationId, title);
        hasSetTitle.current.add(conversationId);
      }
    }
  }, [messages, conversationId, onUpdateTitle]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    // Auto-create conversation if none active
    let targetId = conversationId;
    if (!targetId) {
      targetId = onNewChat();
    }

    handleSubmit(e);
  }

  return (
    <main className="flex flex-1 flex-col h-screen min-w-0">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-lens-border px-4 py-3 shrink-0">
        {!sidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="text-lens-muted hover:text-lens-text transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}
        {sidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="text-lens-muted hover:text-lens-text transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        )}
        <span className="text-sm text-lens-muted">
          {conversationId ? "Chat" : "AgentLens Studio"}
        </span>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center max-w-md mx-auto px-4">
              <div className="mb-4 text-4xl">
                <svg
                  className="h-12 w-12 mx-auto text-lens-accent/40"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-lens-text mb-2">
                AgentLens Studio
              </h2>
              <p className="text-sm text-lens-muted">
                Chat with your AI agents through the AgentLens proxy.
                Every message is logged, cached, and cost-tracked.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6 space-y-1">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-3 py-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-lens-accent/20 text-lens-accent text-xs font-bold">
                    AI
                  </div>
                  <div className="typing-cursor text-lens-muted text-sm"></div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        input={input}
        isLoading={isLoading}
        onChange={handleInputChange}
        onSubmit={onSubmit}
      />
    </main>
  );
}
