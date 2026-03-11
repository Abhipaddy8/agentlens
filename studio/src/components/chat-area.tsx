"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { BriefProgress } from "@/components/brief-progress";
import { BriefCompleteCard } from "@/components/brief-complete-card";
import { MissionMapCard } from "@/components/mission-map-card";
import { BuildProgress } from "@/components/build-progress";
import { GameSelector } from "@/components/game-selector";
import { GameWrapper } from "@/components/game-wrapper";
import { IntegrationPrompt } from "@/components/integration-prompt";
import type { IntegrationPromptData } from "@/components/integration-prompt";
import type { MissionMapData } from "@/components/mission-map-card";
import type { GameChoice } from "@/components/game-selector";

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

  // Build state
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildComplete, setBuildComplete] = useState(false);
  const [activeMissionIdx, setActiveMissionIdx] = useState(0);
  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const buildStartTime = useRef<number>(0);

  // Integration prompt state
  const [integrationPrompts, setIntegrationPrompts] = useState<
    Array<{ afterMessageId: string; data: IntegrationPromptData }>
  >([]);

  // Game state
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameChoice | null>(null);
  const [gameDismissed, setGameDismissed] = useState(false);
  const gameSelectorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [messages, missionMap, isBuilding, selectedGame, showGameSelector]);

  // Clear messages when switching conversations
  useEffect(() => {
    setMessages([]);
    setMissionMap(null);
    setIsBuilding(false);
    setBuildComplete(false);
    setActiveMissionIdx(0);
    setActiveBlockIdx(0);
    setCurrentTask("");
    setBuildLogs([]);
    setShowGameSelector(false);
    setSelectedGame(null);
    setGameDismissed(false);
    setIntegrationPrompts([]);
    if (gameSelectorTimerRef.current) clearTimeout(gameSelectorTimerRef.current);
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

  // Parse integration-prompt data events from assistant messages
  useEffect(() => {
    const prompts: Array<{ afterMessageId: string; data: IntegrationPromptData }> = [];
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      // Match integration prompt markers embedded in content
      const regex = /<!-- INTEGRATION_PROMPT_START -->([\s\S]*?)<!-- INTEGRATION_PROMPT_END -->/g;
      let match;
      while ((match = regex.exec(msg.content)) !== null) {
        try {
          const parsed = JSON.parse(match[1]) as IntegrationPromptData;
          if (parsed.type === "integration-prompt" && parsed.service && parsed.mode) {
            prompts.push({ afterMessageId: msg.id, data: parsed });
          }
        } catch {
          // Invalid JSON — skip
        }
      }
    }
    setIntegrationPrompts(prompts);
  }, [messages]);

  // Simulate build progress when building starts
  useEffect(() => {
    if (!isBuilding || !missionMap || buildComplete) return;

    const missions = missionMap.missions;
    let mIdx = 0;
    let bIdx = 0;

    const TASK_LABELS = [
      "Setting up project structure...",
      "Installing dependencies...",
      "Building component scaffolds...",
      "Writing business logic...",
      "Connecting data layer...",
      "Running type checks...",
      "Generating API routes...",
      "Wiring up the UI...",
      "Optimizing bundle...",
      "Running integration tests...",
    ];

    let logCount = 0;
    const interval = setInterval(() => {
      if (mIdx >= missions.length) {
        setBuildComplete(true);
        clearInterval(interval);
        return;
      }

      const mission = missions[mIdx];
      const totalBlocks = mission.blocks.length;

      // Advance block
      bIdx++;
      if (bIdx >= totalBlocks) {
        bIdx = 0;
        mIdx++;
        setActiveMissionIdx(mIdx);
        if (mIdx < missions.length) {
          setBuildLogs((prev) => [...prev, `--- Mission ${mIdx + 1}: ${missions[mIdx].name} ---`]);
        }
      }
      setActiveBlockIdx(bIdx);

      // Cycle through task labels
      const taskLabel = mIdx < missions.length
        ? `${missions[mIdx].blocks[bIdx]?.name || "Processing"}...`
        : "Finalizing...";
      setCurrentTask(taskLabel);

      // Add log line
      logCount++;
      const logLine = TASK_LABELS[logCount % TASK_LABELS.length];
      setBuildLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${logLine}`]);
    }, 2000 + Math.random() * 1500);

    return () => clearInterval(interval);
  }, [isBuilding, missionMap, buildComplete]);

  // Show game selector 3 seconds after build starts
  useEffect(() => {
    if (isBuilding && !gameDismissed && !selectedGame) {
      gameSelectorTimerRef.current = setTimeout(() => {
        setShowGameSelector(true);
      }, 3000);
      return () => {
        if (gameSelectorTimerRef.current) clearTimeout(gameSelectorTimerRef.current);
      };
    }
  }, [isBuilding, gameDismissed, selectedGame]);

  // Pause game when system is sending messages (isLoading with assistant response)
  const isGamePaused = isLoading && messages[messages.length - 1]?.role === "assistant";

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

    // Start the build progress UI
    setIsBuilding(true);
    setBuildComplete(false);
    setActiveMissionIdx(0);
    setActiveBlockIdx(0);
    setCurrentTask("Initializing build pipeline...");
    setBuildLogs(["[" + new Date().toLocaleTimeString() + "] Build started"]);
    buildStartTime.current = Date.now();

    handleSubmit(fakeEvent);
  }, [messages, setMessages, handleSubmit]);

  const handleModify = useCallback(() => {
    // Clear the mission map so user can keep chatting
    setMissionMap(null);
  }, []);

  const handleGameSelect = useCallback((game: GameChoice) => {
    setSelectedGame(game);
    setShowGameSelector(false);
  }, []);

  const handleGameDismiss = useCallback(() => {
    setShowGameSelector(false);
    setGameDismissed(true);
  }, []);

  const handleSwitchGame = useCallback(() => {
    setSelectedGame(null);
    setShowGameSelector(true);
  }, []);

  const handleCloseGame = useCallback(() => {
    setSelectedGame(null);
    setGameDismissed(true);
    setShowGameSelector(false);
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
              <div key={message.id}>
                <ChatMessage
                  role={message.role}
                  content={message.content}
                />
                {/* Render integration prompts attached to this message */}
                {integrationPrompts
                  .filter((p) => p.afterMessageId === message.id)
                  .map((p, idx) => (
                    <IntegrationPrompt
                      key={`${message.id}-int-${idx}`}
                      data={p.data}
                    />
                  ))}
              </div>
            ))}

            {/* Thinking indicator */}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <ThinkingIndicator />
              )}

            {/* Brief complete card — shows inline mission map when available */}
            {isBriefComplete && !isLoading && !isBuilding && (
              <BriefCompleteCard
                messages={messages}
                missionMap={missionMap}
                onCompile={handleCompile}
                onStartBuilding={handleStartBuilding}
                onModify={handleModify}
              />
            )}

            {/* Standalone mission map for data injected via message parsing */}
            {!isBriefComplete && missionMap && !isBuilding && (
              <MissionMapCard
                data={missionMap}
                onStartBuilding={handleStartBuilding}
                onModify={handleModify}
              />
            )}

            {/* Build Progress UI */}
            {isBuilding && missionMap && (
              <BuildProgress
                missionMap={missionMap}
                activeMissionIdx={activeMissionIdx}
                activeBlockIdx={activeBlockIdx}
                currentTask={currentTask}
                logs={buildLogs}
                buildComplete={buildComplete}
              />
            )}

            {/* Game selector — appears 3s after build starts */}
            {isBuilding && showGameSelector && !selectedGame && (
              <GameSelector
                onSelect={handleGameSelect}
                onDismiss={handleGameDismiss}
              />
            )}

            {/* Game wrapper — shows the selected game */}
            {isBuilding && selectedGame && (
              <GameWrapper
                game={selectedGame}
                paused={isGamePaused}
                buildComplete={buildComplete}
                onSwitchGame={handleSwitchGame}
                onClose={handleCloseGame}
              />
            )}

            {/* Build complete card */}
            {buildComplete && (
              <div className="mx-auto max-w-2xl my-4 build-complete-glow">
                <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 to-transparent p-5 text-center">
                  <svg className="h-10 w-10 mx-auto text-emerald-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-emerald-400 mb-1">Your agent is ready!</h3>
                  <p className="text-xs text-lens-muted">
                    All {missionMap?.missions.length} missions completed successfully.
                  </p>
                </div>
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
