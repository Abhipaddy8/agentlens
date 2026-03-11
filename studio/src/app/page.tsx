"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatArea } from "@/components/chat-area";

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function createConversation(): string {
    const id = crypto.randomUUID();
    const conv: Conversation = {
      id,
      title: "New Chat",
      createdAt: new Date(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(id);
    return id;
  }

  function updateConversationTitle(id: string, title: string) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }

  function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        isOpen={sidebarOpen}
        onSelect={setActiveConversationId}
        onNew={createConversation}
        onDelete={deleteConversation}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main chat area */}
      <ChatArea
        conversationId={activeConversationId}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onNewChat={createConversation}
        onUpdateTitle={updateConversationTitle}
      />
    </div>
  );
}
