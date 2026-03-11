"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { BriefProgress } from "@/components/brief-progress";
import { BriefCompleteCard } from "@/components/brief-complete-card";
import { MissionMapCard } from "@/components/mission-map-card";
import type { MissionMapData } from "@/components/mission-map-card";

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
  const [missionMap, setMissionMap] = useState<MissionMapData | null>(null);

  // Compute brief progress based on message count
  const briefProgress = useMemo(() => {
    const count = messages.length;
    if (count >= 8) return 100;
    if (count >= 6) return 75;
    if (count >= 4) return 50;
    if (count >= 2) return 25;
    return 0;
  }, [messages.length]);

  const isBriefComplete = briefProgress === 100;

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, missionMap]);

  // Clear messages when switching conversations
  useEffect(() => {
    setMessages([]);
    setMissionMap(null);
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

  // Check for mission map data in assistant messages (data event pattern)
  useEffect(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    // Check if the message content contains a mission map JSON block
    const mapMatch = lastAssistant.content.match(
      /<!-- MISSION_MAP_START -->([\s\S]*?)<!-- MISSION_MAP_END -->/
    );
    if (mapMatch) {
      try {
        const parsed = JSON.parse(mapMatch[1]) as MissionMapData;
        setMissionMap(parsed);
      } catch {
        // Invalid JSON — ignore
      }
    }
  }, [messages]);

  const handleCompile = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compile", messages }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.missionMap) {
          setMissionMap(data.missionMap);
        }
      }
    } catch {
      // Silently handle
    }
  }, [messages]);

  const handleStartBuilding = useCallback(() => {
    // Emit a user message to kick off the build
    // For now, this is a placeholder — the backend will handle the actual build
    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent;

    // Add a system-like message indicating build start
    setMessages([
      ...messages,
      {
        id: `build-start-${Date.now()}`,
        role: "user" as const,
        content: "Let's go. Start building.",
        createdAt: new Date(),
      },
    ]);

    handleSubmit(fakeEvent);
  }, [messages, setMessages, handleSubmit]);

  const handleModify = useCallback(() => {
    // Clear the mission map so user can keep chatting
    setMissionMap(null);
  }, []);

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

      {/* Brief collection progress bar */}
      <BriefProgress messageCount={messages.length} />

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

            {/* Thinking indicator */}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <ThinkingIndicator />
              )}

            {/* Brief complete card — shows inline mission map when available */}
            {isBriefComplete && !isLoading && (
              <BriefCompleteCard
                messages={messages}
                missionMap={missionMap}
                onCompile={handleCompile}
                onStartBuilding={handleStartBuilding}
                onModify={handleModify}
              />
            )}

            {/* Standalone mission map for data injected via message parsing */}
            {!isBriefComplete && missionMap && (
              <MissionMapCard
                data={missionMap}
                onStartBuilding={handleStartBuilding}
                onModify={handleModify}
              />
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
