/**
 * Integration Detector — Scans conversation messages for integration keywords.
 *
 * Maps natural-language mentions (e.g. "send a Slack message") to structured
 * integration objects the frontend can render as connect buttons.
 *
 * Tracks which integrations have already been prompted so the same service
 * is never surfaced twice in a single session.
 */

import { ChatMessage, DetectedIntegration } from "./types";

/** Keyword-to-service mapping. Order matters: first match wins per service. */
interface KeywordMapping {
  keywords: string[];
  service: string;
  mode: "oauth" | "apikey" | "mcp";
  displayName: string;
}

const KEYWORD_MAP: KeywordMapping[] = [
  // OAuth services
  {
    keywords: ["slack message", "slack notification", "slack"],
    service: "slack",
    mode: "oauth",
    displayName: "Slack",
  },
  {
    keywords: ["hubspot crm", "hubspot", "crm"],
    service: "hubspot",
    mode: "oauth",
    displayName: "HubSpot",
  },
  {
    keywords: ["google sheets", "spreadsheet", "google drive"],
    service: "google",
    mode: "oauth",
    displayName: "Google",
  },
  {
    keywords: ["salesforce", "sfdc"],
    service: "salesforce",
    mode: "oauth",
    displayName: "Salesforce",
  },
  // API key services
  {
    keywords: ["stripe", "payment"],
    service: "stripe",
    mode: "apikey",
    displayName: "Stripe",
  },
  {
    keywords: ["twilio", "sms", "whatsapp"],
    service: "twilio",
    mode: "apikey",
    displayName: "Twilio",
  },
  {
    keywords: ["sendgrid", "email send"],
    service: "sendgrid",
    mode: "apikey",
    displayName: "SendGrid",
  },
  {
    keywords: ["openai", "gpt"],
    service: "openai",
    mode: "apikey",
    displayName: "OpenAI",
  },
  // MCP
  {
    keywords: ["mcp server", "mcp url", "mcp"],
    service: "mcp",
    mode: "mcp",
    displayName: "MCP Server",
  },
];

/**
 * Set of services already prompted in the current session.
 * Keyed by sessionId so multiple sessions don't interfere.
 */
const promptedBySession = new Map<string, Set<string>>();

/**
 * Mark a service as already prompted so it won't be detected again.
 */
export function markPrompted(sessionId: string, service: string): void {
  if (!promptedBySession.has(sessionId)) {
    promptedBySession.set(sessionId, new Set());
  }
  promptedBySession.get(sessionId)!.add(service);
}

/**
 * Clear prompted state for a session (e.g. on session reset).
 */
export function clearPrompted(sessionId: string): void {
  promptedBySession.delete(sessionId);
}

/**
 * Scan conversation messages for integration keywords.
 *
 * Only returns NEW integrations — services already prompted for in this
 * session are excluded. Each detected integration is also auto-marked
 * as prompted so subsequent calls won't return it again.
 *
 * @param messages - The full conversation history
 * @param sessionId - Session identifier for prompted-state tracking (default: "default")
 * @returns Array of newly detected integrations
 */
export function detectIntegrations(
  messages: ChatMessage[],
  sessionId: string = "default"
): DetectedIntegration[] {
  const prompted = promptedBySession.get(sessionId) ?? new Set<string>();

  // Build a single lowercase string from all user messages for scanning
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  const detected: DetectedIntegration[] = [];
  const seenServices = new Set<string>();

  for (const mapping of KEYWORD_MAP) {
    // Skip if already prompted or already found in this pass
    if (prompted.has(mapping.service) || seenServices.has(mapping.service)) {
      continue;
    }

    // Check keywords longest-first (multi-word phrases before single words)
    for (const keyword of mapping.keywords) {
      if (userText.includes(keyword)) {
        detected.push({
          service: mapping.service,
          mode: mapping.mode,
          displayName: mapping.displayName,
          detected_keyword: keyword,
        });
        seenServices.add(mapping.service);
        break; // One match per service is enough
      }
    }
  }

  // Mark all newly detected services as prompted
  for (const d of detected) {
    markPrompted(sessionId, d.service);
  }

  return detected;
}
