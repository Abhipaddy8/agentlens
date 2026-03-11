"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: string;
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex gap-3 py-4 ${
        isUser ? "" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
          isUser
            ? "bg-lens-surface2 text-lens-muted"
            : "bg-lens-accent/20 text-lens-accent"
        }`}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Message content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-lens-muted">
          {isUser ? "You" : "Assistant"}
        </div>
        {isUser ? (
          <p className="text-sm text-lens-text whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-lens-text prose-headings:text-lens-text prose-a:text-lens-accent prose-code:text-lens-accent prose-code:bg-lens-surface2 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-lens-surface prose-pre:border prose-pre:border-lens-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
