# AgentLens Studio — Chat API

Streaming chat endpoint for the Agent Studio UI.

## Integration

Copy `route.ts` into your Next.js App Router at:

```
app/api/chat/route.ts
```

No additional dependencies required — uses only Web Streams API and Next.js built-ins.

## What it does (M19 — stub)

- Accepts `POST /api/chat` with `{ messages: [{ role, content }] }`
- Returns SSE stream (`text/event-stream`) with token-by-token response
- Each SSE chunk: `data: {"type":"text","value":"token"}\n\n`
- Stream ends with `data: [DONE]\n\n`
- Currently echoes a static placeholder to prove the streaming pipeline works

## What M20 adds (Conversation Controller)

The `TODO` block in `route.ts` marks where the real conversation controller gets wired in. M20 will:

- Import `ConversationController` which orchestrates multi-turn agent building conversations
- Route messages through a state machine (gather requirements -> generate code -> iterate)
- Stream real LLM responses instead of the placeholder
- Persist conversation state for multi-turn sessions

## Client usage

```ts
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Build me a support ticket agent" }],
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Parse SSE lines: data: {"type":"text","value":"..."}
}
```
