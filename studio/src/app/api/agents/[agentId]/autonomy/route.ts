/**
 * GET /api/agents/[agentId]/autonomy — Fetch autonomy config.
 * PUT /api/agents/[agentId]/autonomy — Save autonomy config.
 *
 * PUT body: { actions: [...], trustLevel: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAutonomyConfig, saveAutonomyConfig, applyTrustLevel } from "@/lib/autonomy-config";
import { AutonomyConfig } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const config = await getAutonomyConfig(agentId);
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch autonomy config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const body = await req.json();
    const { actions, trustLevel } = body as AutonomyConfig;

    if (trustLevel === undefined || !Array.isArray(actions)) {
      return NextResponse.json(
        { error: "actions array and trustLevel number are required" },
        { status: 400 }
      );
    }

    // Apply trust level to normalize the config
    const normalized = applyTrustLevel({ actions, trustLevel }, trustLevel);
    await saveAutonomyConfig(agentId, normalized);

    return NextResponse.json(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save autonomy config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
