/**
 * AgentLens Studio — Memory Manager
 *
 * Wraps the agent-runtime/memory.js patterns for the Studio API.
 * Provides read/write/delete of long-term, short-term, and shared memories.
 *
 * Currently uses in-memory store with realistic mock data.
 * Swap to DynamoDB when agent_memory_* tables are live.
 *
 * DynamoDB tables (from architecture):
 * - agent_memory_long (PK: agentId, SK: memoryId)
 * - agent_memory_short (PK: agentId, SK: runId#stepIndex)
 * - agent_memory_shared (PK: accountId, SK: memoryId)
 */

import { MemoryItem, Learning } from "./types";

// ─── In-Memory Store ────────────────────────────────────────

let memoryStore: Map<string, MemoryItem[]> = new Map();
let learningStore: Map<string, Learning[]> = new Map();
let sharedMemoryStore: Map<string, MemoryItem[]> = new Map();

// ─── Seed Mock Data ─────────────────────────────────────────

function seedIfEmpty(agentId: string): void {
  if (memoryStore.has(agentId)) return;

  const now = new Date();
  const daysAgo = (d: number) =>
    new Date(now.getTime() - d * 86400000).toISOString();

  const memories: MemoryItem[] = [
    {
      id: "mem-001",
      content: "HubSpot API rate limit is 100 requests per 10 seconds. Batch deal fetches in groups of 50 to stay safe.",
      importance: 0.95,
      createdAt: daysAgo(14),
      lastAccessed: daysAgo(0),
      accessCount: 47,
    },
    {
      id: "mem-002",
      content: "Deals owned by Sarah Chen (sarah@opera-erp.com) should never be auto-tagged as stale. She uses long nurture cycles.",
      importance: 0.92,
      createdAt: daysAgo(10),
      lastAccessed: daysAgo(0),
      accessCount: 38,
    },
    {
      id: "mem-003",
      content: "#sales-ops Slack channel ID is C04ABCDEF12. #sales-leadership is C04GHIJKL34. Use leadership channel for deals over $100K.",
      importance: 0.9,
      createdAt: daysAgo(12),
      lastAccessed: daysAgo(0),
      accessCount: 52,
    },
    {
      id: "mem-004",
      content: "Deal stage 'Negotiation' maps to pipeline stage 4 in HubSpot. 'Closed Won' is stage 6. Don't flag stage 4+ deals as stale unless 30+ days idle.",
      importance: 0.88,
      createdAt: daysAgo(11),
      lastAccessed: daysAgo(1),
      accessCount: 29,
    },
    {
      id: "mem-005",
      content: "Weekly pipeline report goes to Google Sheets 'Pipeline Tracker 2026' (sheet ID: 1abc...xyz). Log every Monday at 9:15am.",
      importance: 0.85,
      createdAt: daysAgo(8),
      lastAccessed: daysAgo(3),
      accessCount: 8,
    },
    {
      id: "mem-006",
      content: "Enterprise deals (>$200K) require VP approval before any automated follow-up actions. Only flag and notify, never auto-create tasks.",
      importance: 0.93,
      createdAt: daysAgo(9),
      lastAccessed: daysAgo(0),
      accessCount: 22,
    },
    {
      id: "mem-007",
      content: "HubSpot custom property 'deal_health_score' was added on March 3. Include in stale deal analysis for more accurate scoring.",
      importance: 0.78,
      createdAt: daysAgo(8),
      lastAccessed: daysAgo(2),
      accessCount: 14,
    },
    {
      id: "mem-008",
      content: "Time zone: all deal owners are US-based. Schedule Slack notifications for 9am ET, not UTC.",
      importance: 0.82,
      createdAt: daysAgo(13),
      lastAccessed: daysAgo(1),
      accessCount: 41,
    },
    {
      id: "mem-009",
      content: "When HubSpot API returns 503, wait 30 seconds and retry up to 3 times before marking run as failed.",
      importance: 0.87,
      createdAt: daysAgo(5),
      lastAccessed: daysAgo(3),
      accessCount: 4,
    },
    {
      id: "mem-010",
      content: "Deal 'Acme Corp Expansion' (deal ID: 12847392) is the CEO's pet project. Always include in summary even if not stale.",
      importance: 0.76,
      createdAt: daysAgo(6),
      lastAccessed: daysAgo(1),
      accessCount: 18,
    },
    {
      id: "mem-011",
      content: "Google Calendar integration uses service account cal-bot@opera-erp.iam. Max 50 events per batch insert.",
      importance: 0.72,
      createdAt: daysAgo(4),
      lastAccessed: daysAgo(3),
      accessCount: 6,
    },
    {
      id: "mem-012",
      content: "Stale deal threshold changed from 7 days to 14 days on March 5 per sales VP request. Previous threshold caused too many false positives.",
      importance: 0.91,
      createdAt: daysAgo(6),
      lastAccessed: daysAgo(0),
      accessCount: 32,
    },
  ];

  memoryStore.set(agentId, memories);

  const learnings: Learning[] = [
    {
      id: "learn-001",
      content: "Deals with 'Renewal' in the name have a 94% close rate. They should be excluded from stale analysis unless 60+ days idle.",
      source: "Pattern detected from 3 weeks of deal data (87 renewal deals analyzed)",
      learnedAt: daysAgo(2),
    },
    {
      id: "learn-002",
      content: "Monday morning scans consistently find more stale deals (avg 4.2) than other days (avg 2.1). Weekend inactivity inflates the count.",
      source: "Statistical analysis of 14 daily scans",
      learnedAt: daysAgo(1),
    },
    {
      id: "learn-003",
      content: "HubSpot API response times are 2-3x slower between 9:00-9:15am ET due to other integrations running. Consider shifting scan to 8:45am.",
      source: "Latency tracking across 20 morning runs",
      learnedAt: daysAgo(1),
    },
    {
      id: "learn-004",
      content: "Deals that go stale once have a 68% chance of going stale again within 30 days. Consider flagging repeat offenders.",
      source: "Longitudinal tracking of 23 previously-stale deals",
      learnedAt: daysAgo(3),
    },
    {
      id: "learn-005",
      content: "Slack summaries with bullet points and deal-owner mentions get 3x more thread replies than plain text summaries.",
      source: "Slack engagement tracking over 10 summary posts",
      learnedAt: daysAgo(4),
    },
  ];

  learningStore.set(agentId, learnings);
}

function seedSharedIfEmpty(accountId: string): void {
  if (sharedMemoryStore.has(accountId)) return;

  const now = new Date();
  const daysAgo = (d: number) =>
    new Date(now.getTime() - d * 86400000).toISOString();

  const shared: MemoryItem[] = [
    {
      id: "shared-001",
      content: "Company fiscal year ends March 31. All Q4 reports should reference FY2025-26 dates.",
      importance: 0.88,
      createdAt: daysAgo(20),
      lastAccessed: daysAgo(1),
      accessCount: 15,
    },
    {
      id: "shared-002",
      content: "Primary CRM is HubSpot (Enterprise tier). API key rotates monthly on the 1st. Check credential store before runs.",
      importance: 0.92,
      createdAt: daysAgo(18),
      lastAccessed: daysAgo(0),
      accessCount: 34,
    },
    {
      id: "shared-003",
      content: "Slack workspace: opera-erp.slack.com. Bot token scope includes channels:read, chat:write, users:read.",
      importance: 0.85,
      createdAt: daysAgo(16),
      lastAccessed: daysAgo(0),
      accessCount: 28,
    },
  ];

  sharedMemoryStore.set(accountId, shared);
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Get top memories for an agent, sorted by importance.
 * Mirrors agent-runtime/memory.js injectMemories pattern.
 */
export async function getMemories(agentId: string): Promise<MemoryItem[]> {
  seedIfEmpty(agentId);
  const memories = memoryStore.get(agentId) || [];
  return [...memories].sort((a, b) => b.importance - a.importance);
}

/**
 * Get recent learnings — patterns the agent discovered from its runs.
 * Derived from short-term memory consolidation.
 */
export async function getRecentLearnings(
  agentId: string,
  limit: number = 10
): Promise<Learning[]> {
  seedIfEmpty(agentId);
  const learnings = learningStore.get(agentId) || [];
  return [...learnings]
    .sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime())
    .slice(0, limit);
}

/**
 * Manually teach the agent something new.
 * Writes to long-term memory with user-specified importance.
 */
export async function teachMemory(
  agentId: string,
  content: string,
  importance: number = 0.8
): Promise<MemoryItem> {
  seedIfEmpty(agentId);

  const clampedImportance = Math.max(0, Math.min(1, importance));
  const now = new Date().toISOString();

  const newMemory: MemoryItem = {
    id: `mem-${Date.now().toString(36)}`,
    content,
    importance: clampedImportance,
    createdAt: now,
    lastAccessed: now,
    accessCount: 0,
  };

  const existing = memoryStore.get(agentId) || [];
  existing.push(newMemory);
  memoryStore.set(agentId, existing);

  return newMemory;
}

/**
 * Delete a memory by ID.
 */
export async function forgetMemory(
  agentId: string,
  memoryId: string
): Promise<void> {
  seedIfEmpty(agentId);
  const existing = memoryStore.get(agentId) || [];
  const filtered = existing.filter((m) => m.id !== memoryId);

  if (filtered.length === existing.length) {
    throw new Error(`Memory ${memoryId} not found for agent ${agentId}`);
  }

  memoryStore.set(agentId, filtered);
}

/**
 * Get cross-agent shared memories for an account.
 * Mirrors agent-runtime/memory.js getSharedMemories pattern.
 */
export async function getSharedMemories(
  accountId: string
): Promise<MemoryItem[]> {
  seedSharedIfEmpty(accountId);
  const memories = sharedMemoryStore.get(accountId) || [];
  return [...memories].sort((a, b) => b.importance - a.importance);
}
