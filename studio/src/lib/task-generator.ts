/**
 * Task Generator — LLM-powered task breakdown for each mission.
 *
 * Takes a mission + parsed brief → produces 3-8 specific, actionable tasks.
 * enrichMissionMap() runs all missions in parallel for speed.
 */

import OpenAI from "openai";
import { ParsedBrief } from "./brief-compiler";
import { Mission, MissionMap } from "./mission-architect";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * Generate 3-8 specific tasks for a single mission.
 */
export async function generateTasks(
  mission: Mission,
  brief: ParsedBrief
): Promise<string[]> {
  const systemPrompt = `You are a senior engineer breaking down a build mission into specific, actionable tasks.

Given a mission and its context, generate 3-8 tasks. Each task should be:
- Specific enough to be a single coding session (30-60 min)
- Ordered by dependency (earlier tasks don't depend on later ones)
- Concrete — not "set up X" but "create X file with Y config that does Z"
- Scoped to this mission only — don't reference other missions

The mission has these pipeline blocks that show the major components:
${mission.pipelineBlocks.map((b) => `  - ${b}`).join("\n")}

Project context:
- Name: ${brief.projectName}
- Intent: ${brief.intent}
- Stack: ${brief.stack.join(", ") || "Node.js"}
- Complexity: ${brief.complexity}

Respond with a JSON array of task strings. No markdown fences. Example:
["Create handler.js with Lambda entry point and request parsing", "Add HubSpot API client with deal search by last activity date", "Build Slack message formatter with deal summary template"]`;

  const userPrompt = `Mission: ${mission.name}
Type: ${mission.type}
Goal: ${mission.goal}
Pipeline Blocks: ${mission.pipelineBlocks.join(" → ")}

Brief features: ${brief.features.join("; ") || "none specified"}
Brief constraints: ${brief.constraints.join("; ") || "none specified"}
Integrations: ${brief.integrations.join(", ") || "none"}
Data sources: ${brief.dataSources.join(", ") || "none"}
Trigger: ${brief.trigger}
Output: ${brief.output}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content?.trim() || "[]";
    const jsonStr = content
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "");
    const tasks: string[] = JSON.parse(jsonStr);

    // Enforce 3-8 task range
    if (tasks.length < 3) {
      return [
        ...tasks,
        ...Array(3 - tasks.length).fill(
          `Implement ${mission.name} core functionality`
        ),
      ];
    }
    return tasks.slice(0, 8);
  } catch (err) {
    // Fallback: generate basic tasks from pipeline blocks
    console.error(
      `Task generation failed for mission ${mission.id}:`,
      err instanceof Error ? err.message : err
    );
    return mission.pipelineBlocks.map(
      (block) => `Implement ${block} for ${mission.name}`
    );
  }
}

/**
 * Enrich all missions in a mission map with generated tasks.
 * Runs all LLM calls in parallel for speed.
 */
export async function enrichMissionMap(
  missionMap: MissionMap,
  brief: ParsedBrief
): Promise<MissionMap> {
  const enrichedMissions = await Promise.all(
    missionMap.missions.map(async (mission) => {
      const tasks = await generateTasks(mission, brief);
      return { ...mission, tasks };
    })
  );

  return {
    ...missionMap,
    missions: enrichedMissions,
  };
}
