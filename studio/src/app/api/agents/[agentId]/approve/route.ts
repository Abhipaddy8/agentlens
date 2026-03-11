/**
 * POST /api/agents/[agentId]/approve — Respond to an approval request.
 * GET  /api/agents/[agentId]/approve — List pending approvals for the agent.
 *
 * POST body: { requestId, decision: "approved"|"denied", note?, decidedBy? }
 * GET query: ?status=waiting (optional filter)
 */

import { NextRequest, NextResponse } from "next/server";
import { respondToApproval, listApprovals, createApprovalRequest } from "@/lib/approval-manager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const body = await req.json();
    const { requestId, decision, note, decidedBy } = body;

    if (!requestId || !decision) {
      return NextResponse.json(
        { error: "requestId and decision are required" },
        { status: 400 }
      );
    }

    if (decision !== "approved" && decision !== "denied") {
      return NextResponse.json(
        { error: 'decision must be "approved" or "denied"' },
        { status: 400 }
      );
    }

    const updated = await respondToApproval(requestId, decision, note, decidedBy);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to respond to approval";
    const status = message.includes("not found") ? 404 : message.includes("already") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const status = req.nextUrl.searchParams.get("status") || undefined;

  try {
    const approvals = await listApprovals(agentId, status);
    return NextResponse.json({ approvals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list approvals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
