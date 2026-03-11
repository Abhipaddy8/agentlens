/**
 * GET /api/agents/[agentId]/approvals/history — Approval history with response times.
 *
 * Query params:
 *   - status (string, optional) — filter by decision: "approved", "denied", "expired"
 */

import { NextRequest, NextResponse } from "next/server";
import { getApprovalHistory } from "@/lib/approval-manager";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const statusFilter = req.nextUrl.searchParams.get("status") || undefined;

  try {
    let history = await getApprovalHistory(agentId);

    if (statusFilter) {
      history = history.filter((h) => h.decision === statusFilter);
    }

    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch approval history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
