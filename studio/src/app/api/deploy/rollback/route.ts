import { NextRequest } from "next/server";
import {
  rollback,
  getActiveVersion,
  getPreviousVersion,
  getVersionHistory,
} from "@/lib/rollback-manager";

/**
 * POST /api/deploy/rollback
 *
 * Manually roll back an agent to a previous version.
 *
 * Body: { agentId: string, toVersion?: string }
 *   - If toVersion is omitted, rolls back to the most recent previous version.
 *
 * Returns: RollbackResult
 */
export async function POST(req: NextRequest) {
  let body: { agentId?: string; toVersion?: string };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { agentId, toVersion } = body;

  if (!agentId) {
    return new Response(
      JSON.stringify({ error: "agentId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get current active version
  const active = getActiveVersion(agentId);
  if (!active) {
    return new Response(
      JSON.stringify({ error: `No active version found for agent ${agentId}` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Determine target version
  let targetVersion = toVersion;
  if (!targetVersion) {
    const prev = getPreviousVersion(agentId);
    if (!prev) {
      return new Response(
        JSON.stringify({
          error: `No previous version available for rollback. History: ${JSON.stringify(getVersionHistory(agentId))}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    targetVersion = prev.version;
  }

  // Execute rollback
  const result = await rollback(agentId, active.version, targetVersion);

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}
