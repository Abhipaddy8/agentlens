/**
 * ConversationController — The brain behind /api/chat.
 *
 * Stateful controller that:
 * 1. Analyzes conversation history to extract what's been collected
 * 2. Decides what to ask next based on missing required/optional fields
 * 3. Generates natural conversational responses via LLM
 * 4. Knows when the brief is complete
 * 5. Compiles the final brief string
 */

import OpenAI from "openai";
import {
  BriefState,
  ChatMessage,
  ControllerMetadata,
  FIELD_DEFINITIONS,
  BriefFieldKey,
} from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** Empty brief state. */
function emptyBriefState(): BriefState {
  return {
    projectType: null,
    integrations: null,
    trigger: null,
    constraints: null,
    dataSources: null,
    output: null,
  };
}

export class ConversationController {
  private messages: ChatMessage[];
  private briefState: BriefState;

  constructor(messages: ChatMessage[]) {
    this.messages = messages;
    this.briefState = emptyBriefState();
  }

  /**
   * Analyze the full conversation to extract what's been collected.
   * Uses an LLM to parse free-form conversation into structured fields.
   */
  async analyzeConversation(): Promise<BriefState> {
    if (this.messages.length === 0) {
      this.briefState = emptyBriefState();
      return this.briefState;
    }

    const conversationText = this.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const extractionPrompt = `Analyze this conversation and extract what has been discussed about building an AI agent. Return a JSON object with these fields (use null if not mentioned):

- projectType: What the agent should do (its core purpose)
- trigger: What kicks it off (schedule/cron, webhook, manual, event)
- dataSources: Where it reads data from
- integrations: External services it connects to
- output: Where results/alerts go
- constraints: What it should NOT do, limits, guardrails

Be precise. Only extract what was explicitly stated or clearly implied. Do not invent information.

Conversation:
${conversationText}

Respond with ONLY valid JSON, no markdown fences.`;

    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content?.trim() || "{}";
      // Strip markdown fences if present
      const jsonStr = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(jsonStr);

      this.briefState = {
        projectType: parsed.projectType || null,
        integrations: parsed.integrations || null,
        trigger: parsed.trigger || null,
        constraints: parsed.constraints || null,
        dataSources: parsed.dataSources || null,
        output: parsed.output || null,
      };
    } catch {
      // If extraction fails, keep empty state — the conversation continues
      this.briefState = emptyBriefState();
    }

    return this.briefState;
  }

  /**
   * Determine the next topic to ask about based on missing fields.
   * Required fields first, then optional ones.
   */
  getNextTopic(): string | null {
    // Check required fields first
    for (const field of FIELD_DEFINITIONS) {
      if (field.required && !this.briefState[field.key]) {
        return field.key;
      }
    }

    // Then optional fields (only ask about a couple, not all)
    const missingOptional = FIELD_DEFINITIONS.filter(
      (f) => !f.required && !this.briefState[f.key]
    );

    if (missingOptional.length > 0) {
      return missingOptional[0].key;
    }

    return null; // Everything collected
  }

  /**
   * Check if all required fields are present.
   */
  isComplete(): boolean {
    return FIELD_DEFINITIONS.filter((f) => f.required).every(
      (f) => this.briefState[f.key] !== null
    );
  }

  /**
   * Calculate completion percentage.
   */
  getCompletionPercent(): number {
    const required = FIELD_DEFINITIONS.filter((f) => f.required);
    const collected = required.filter((f) => this.briefState[f.key] !== null);
    return Math.round((collected.length / required.length) * 100);
  }

  /**
   * Get the current phase name.
   */
  getCurrentPhase(): string {
    if (this.messages.length === 0) return "greeting";
    if (this.isComplete()) return "brief-ready";

    const nextTopic = this.getNextTopic();
    if (!nextTopic) return "brief-ready";

    const field = FIELD_DEFINITIONS.find((f) => f.key === nextTopic);
    return field ? `collecting-${field.key}` : "collecting";
  }

  /**
   * Get list of collected field names.
   */
  getCollectedFields(): string[] {
    return FIELD_DEFINITIONS.filter((f) => this.briefState[f.key] !== null).map(
      (f) => f.key
    );
  }

  /**
   * Build the controller metadata.
   */
  getMetadata(): ControllerMetadata {
    return {
      briefComplete: this.isComplete(),
      completionPercent: this.getCompletionPercent(),
      currentPhase: this.getCurrentPhase(),
      collectedFields: this.getCollectedFields(),
      briefState: this.briefState,
    };
  }

  /**
   * Add a connected integration to the brief state.
   * Called when an integration is successfully connected via OAuth/API key/MCP.
   */
  addConnectedIntegration(service: string): void {
    const current = this.briefState.integrations;
    if (current) {
      // Avoid duplicates
      if (!current.toLowerCase().includes(service.toLowerCase())) {
        this.briefState.integrations = `${current}, ${service}`;
      }
    } else {
      this.briefState.integrations = service;
    }
  }

  /**
   * Get a mutable reference to the brief state (for external updates).
   */
  getBriefState(): BriefState {
    return this.briefState;
  }

  /**
   * Compile the collected data into a raw brief string.
   */
  compileBrief(): string {
    const lines: string[] = [];

    lines.push("# Agent Brief");
    lines.push("");

    if (this.briefState.projectType) {
      lines.push(`## Project Type`);
      lines.push(this.briefState.projectType);
      lines.push("");
    }

    if (this.briefState.trigger) {
      lines.push(`## Trigger`);
      lines.push(this.briefState.trigger);
      lines.push("");
    }

    if (this.briefState.dataSources) {
      lines.push(`## Data Sources`);
      lines.push(this.briefState.dataSources);
      lines.push("");
    }

    if (this.briefState.integrations) {
      lines.push(`## Integrations`);
      lines.push(this.briefState.integrations);
      lines.push("");
    }

    if (this.briefState.output) {
      lines.push(`## Output`);
      lines.push(this.briefState.output);
      lines.push("");
    }

    if (this.briefState.constraints) {
      lines.push(`## Constraints`);
      lines.push(this.briefState.constraints);
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Build the system prompt for the LLM based on current state.
   */
  private buildSystemPrompt(): string {
    const collectedSummary = FIELD_DEFINITIONS.filter(
      (f) => this.briefState[f.key] !== null
    )
      .map((f) => `- ${f.label}: ${this.briefState[f.key]}`)
      .join("\n");

    const missingSummary = FIELD_DEFINITIONS.filter(
      (f) => this.briefState[f.key] === null
    )
      .map(
        (f) =>
          `- ${f.label} (${f.required ? "REQUIRED" : "optional"}): ${f.description}. Examples: ${f.examples}`
      )
      .join("\n");

    const nextTopic = this.getNextTopic();
    const nextField = nextTopic
      ? FIELD_DEFINITIONS.find((f) => f.key === nextTopic)
      : null;

    // Brief is complete — summarize
    if (this.isComplete() && !nextTopic) {
      return `You are AgentLens Studio, a smart AI project manager helping users define their AI agent.

You have collected ALL required information. The brief is complete.

COLLECTED SO FAR:
${collectedSummary}

Your job now: Summarize what you're going to build. Be specific, confident, and concise. Start with "Here's what I'm going to build:" and lay out the agent spec clearly. Use markdown formatting. End by asking if they want to adjust anything before you generate the agent.

Tone: Warm, confident, efficient. Like a senior engineer confirming scope before starting work.`;
    }

    // Still collecting
    return `You are AgentLens Studio, a smart AI project manager helping users define their AI agent. You ask the right questions in the right order — you're not a form, you're a conversation.

ALREADY COLLECTED:
${collectedSummary || "(nothing yet)"}

STILL NEEDED:
${missingSummary}

YOUR NEXT TOPIC: ${nextField ? `Ask about "${nextField.label}" — ${nextField.description}` : "Wrap up any remaining optional details."}

RULES:
- Ask about ONE topic at a time. Keep it natural and conversational.
- Acknowledge what the user just said before asking the next question.
- If the user volunteers info about multiple fields at once, great — acknowledge all of it.
- Don't repeat information you already know.
- Keep responses short — 1-3 sentences max. No walls of text.
- Be specific in your questions. Instead of "what integrations?" ask "Which CRM are you using — HubSpot, Salesforce, or something else?"
- Sound like a smart project manager, not a chatbot filling out a form.
- If this is the first message and the user already described what they need, acknowledge it and move to the next missing field.
- NEVER list all the fields you need to collect. Just ask the next natural question.`;
  }

  /**
   * Generate a streaming response. Returns an async iterator of text chunks.
   */
  async *generateResponse(): AsyncGenerator<string> {
    // First, analyze the conversation to know current state
    await this.analyzeConversation();

    const systemPrompt = this.buildSystemPrompt();

    const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...this.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    ];

    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 500,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}
