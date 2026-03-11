/**
 * GET /api/agents/[agentId]/activity
 *
 * Returns paginated activity feed for an agent.
 * Query params:
 *   - limit (number, default 10) — entries per page
 *   - cursor (string, optional) — session ID to start after
 *
 * Response: { entries: ActivityEntry[], nextCursor?: string, stats: ActivityStats }
 */

import { NextRequest, NextResponse } from "next/server";
import { getActivityFeed, getActivityStats } from "@/lib/activity-feed";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const cursor = searchParams.get("cursor") || undefined;

  try {
    const [feed, stats] = await Promise.all([
      getActivityFeed(agentId, limit, cursor),
      getActivityStats(agentId),
    ]);

    return NextResponse.json({
      entries: feed.entries,
      nextCursor: feed.nextCursor,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch activity feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
