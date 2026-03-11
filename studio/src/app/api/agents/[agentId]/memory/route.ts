/**
 * /api/agents/[agentId]/memory
 *
 * GET  — Returns memories + recent learnings for an agent.
 * POST — Teach a new memory. Body: { content: string, importance?: number }
 * DELETE — Forget a memory. Body: { memoryId: string }
 *
 * Response shapes:
 *   GET:    { memories: MemoryItem[], learnings: Learning[] }
 *   POST:   { memory: MemoryItem }
 *   DELETE: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMemories,
  getRecentLearnings,
  teachMemory,
  forgetMemory,
} from "@/lib/memory-manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const [memories, learnings] = await Promise.all([
      getMemories(agentId),
      getRecentLearnings(agentId),
    ]);

    return NextResponse.json({ memories, learnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch memories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const body = await req.json();
    const { content, importance } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const memory = await teachMemory(agentId, content.trim(), importance);
    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to teach memory";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const body = await req.json();
    const { memoryId } = body;

    if (!memoryId || typeof memoryId !== "string") {
      return NextResponse.json(
        { error: "memoryId is required" },
        { status: 400 }
      );
    }

    await forgetMemory(agentId, memoryId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to forget memory";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
