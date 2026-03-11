/**
 * GET /api/agents/[agentId]/routing
 *
 * Returns recent routing decisions and aggregate stats for an agent.
 * Query params:
 *   - limit (number, default 20) — max decisions to return
 *
 * Response: { decisions: RoutingDecision[], stats: RoutingStats }
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutingDecisions, getRoutingStats } from "@/lib/routing-tracker";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    const [decisions, stats] = await Promise.all([
      getRoutingDecisions(agentId, limit),
      getRoutingStats(agentId),
    ]);

    return NextResponse.json({ decisions, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch routing data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
