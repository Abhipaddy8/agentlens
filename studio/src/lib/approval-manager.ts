/**
 * AgentLens Studio — Approval Manager
 *
 * Core approval management logic for human-in-the-loop workflows.
 * In-memory store for the Studio demo; production uses DynamoDB via agent-runtime/hitl.js.
 *
 * @module lib/approval-manager
 */

import { ApprovalRequest, ApprovalHistoryEntry } from "./types";
import { sendSlackApproval, sendWhatsAppApproval, sendInAppNotification } from "./notification-sender";

// --- In-memory store (production: DynamoDB agentlens-approvals table) ---

const approvalStore = new Map<string, ApprovalRequest>();
const historyStore = new Map<string, ApprovalHistoryEntry[]>();

// --- Seed realistic mock data ---

function seedMockData(): void {
  if (approvalStore.size > 0) return;

  const mockApprovals: ApprovalRequest[] = [
    {
      requestId: "apr-001-email-blast",
      agentId: "opera-crm-monitor",
      agentName: "OperaERP CRM Monitor",
      question: "Send quarterly report email to 47 contacts?",
      context: "The CRM monitor detected 47 contacts who haven't received an update in 90+ days. The agent wants to send a templated quarterly report to all of them via SendGrid.",
      channel: "slack",
      timeoutSeconds: 3600,
      status: "approved",
      createdAt: "2026-03-10T09:15:00Z",
      respondedAt: "2026-03-10T09:18:32Z",
      decision: "approved",
      note: "Go ahead, looks good",
      decidedBy: "Abhishek",
    },
    {
      requestId: "apr-002-hubspot-deals",
      agentId: "opera-crm-monitor",
      agentName: "OperaERP CRM Monitor",
      question: "Update 12 stale deals in HubSpot to 'Lost'?",
      context: "Found 12 deals with no activity for 180+ days. The configured rule is to mark deals as Lost after 180 days of inactivity. Total pipeline value affected: $84,200.",
      channel: "slack",
      timeoutSeconds: 1800,
      status: "denied",
      createdAt: "2026-03-10T14:22:00Z",
      respondedAt: "2026-03-10T14:25:11Z",
      decision: "denied",
      note: "Wait — let me review those deals first, some might be paused on purpose",
      decidedBy: "Abhishek",
    },
    {
      requestId: "apr-003-gpt4o-spend",
      agentId: "lead-enrichment-agent",
      agentName: "Lead Enrichment Pipeline",
      question: "Spend $2.40 on GPT-4o for complex analysis of 60 leads?",
      context: "Batch enrichment job for 60 new leads. Estimated cost: $2.40 (60 × $0.04 per lead). Using GPT-4o for company classification and ICP scoring. Budget remaining this month: $47.60.",
      channel: "in-app",
      timeoutSeconds: 600,
      status: "approved",
      createdAt: "2026-03-11T08:05:00Z",
      respondedAt: "2026-03-11T08:05:45Z",
      decision: "approved",
      decidedBy: "Abhishek",
    },
    {
      requestId: "apr-004-delete-records",
      agentId: "opera-crm-monitor",
      agentName: "OperaERP CRM Monitor",
      question: "Delete 8 duplicate contact records from HubSpot?",
      context: "Detected 8 duplicate contacts (same email, different casing). The agent wants to merge them, keeping the record with more activity and deleting the other. Affected contacts: john.doe@acme.com (2), sarah@bigco.io (2), mike@startup.dev (2), anna@corp.com (2).",
      channel: "whatsapp",
      timeoutSeconds: 3600,
      status: "approved",
      createdAt: "2026-03-09T16:40:00Z",
      respondedAt: "2026-03-09T17:02:18Z",
      decision: "approved",
      note: "Verified — these are real duplicates",
      decidedBy: "Abhishek",
    },
    {
      requestId: "apr-005-webhook-config",
      agentId: "lead-enrichment-agent",
      agentName: "Lead Enrichment Pipeline",
      question: "Register new webhook endpoint for Stripe payment events?",
      context: "The agent detected a Stripe integration was added but no webhook is configured. It wants to register https://agentlens-proxy.example.com/hooks/stripe to receive payment_intent.succeeded events.",
      channel: "slack",
      timeoutSeconds: 1800,
      status: "expired",
      createdAt: "2026-03-08T11:30:00Z",
    },
    {
      requestId: "apr-006-pending-test",
      agentId: "opera-crm-monitor",
      agentName: "OperaERP CRM Monitor",
      question: "Send follow-up sequence to 23 contacts who opened but didn't reply?",
      context: "23 contacts opened the quarterly report email but didn't reply within 7 days. The agent wants to send a shorter follow-up with a direct CTA. Estimated cost: $0.92 via SendGrid.",
      channel: "in-app",
      timeoutSeconds: 7200,
      status: "waiting",
      createdAt: new Date().toISOString(),
    },
  ];

  for (const approval of mockApprovals) {
    approvalStore.set(approval.requestId, approval);
  }

  // Build history from resolved approvals
  const agentHistory = new Map<string, ApprovalHistoryEntry[]>();
  for (const a of mockApprovals) {
    if (a.status === "waiting") continue;
    const entry: ApprovalHistoryEntry = {
      requestId: a.requestId,
      action: a.question,
      decision: a.status as "approved" | "denied" | "expired",
      responseTimeMs: a.respondedAt
        ? new Date(a.respondedAt).getTime() - new Date(a.createdAt).getTime()
        : 0,
      decidedBy: a.decidedBy || "system",
      timestamp: a.respondedAt || a.createdAt,
      note: a.note,
    };
    const existing = agentHistory.get(a.agentId) || [];
    existing.push(entry);
    agentHistory.set(a.agentId, existing);
  }
  for (const [agentId, entries] of agentHistory) {
    historyStore.set(agentId, entries);
  }
}

// Seed on module load
seedMockData();

// --- Timeout checker ---

let timeoutInterval: ReturnType<typeof setInterval> | null = null;

function startTimeoutChecker(): void {
  if (timeoutInterval) return;
  timeoutInterval = setInterval(() => {
    const now = Date.now();
    for (const [, req] of approvalStore) {
      if (req.status !== "waiting") continue;
      const createdMs = new Date(req.createdAt).getTime();
      if (now - createdMs > req.timeoutSeconds * 1000) {
        req.status = "expired";
        // Add to history
        const entries = historyStore.get(req.agentId) || [];
        entries.push({
          requestId: req.requestId,
          action: req.question,
          decision: "expired",
          responseTimeMs: now - createdMs,
          decidedBy: "system",
          timestamp: new Date().toISOString(),
        });
        historyStore.set(req.agentId, entries);
      }
    }
  }, 10_000); // Check every 10 seconds
}

startTimeoutChecker();

// --- Public API ---

let requestCounter = 100;

/**
 * Create a new approval request.
 */
export async function createApprovalRequest(
  agentId: string,
  question: string,
  context: string,
  channel: "slack" | "whatsapp" | "in-app" = "in-app",
  timeoutSeconds = 3600
): Promise<ApprovalRequest> {
  requestCounter++;
  const requestId = `apr-${String(requestCounter).padStart(3, "0")}-${Date.now().toString(36)}`;

  const request: ApprovalRequest = {
    requestId,
    agentId,
    agentName: agentId, // In production, look up from agent registry
    question,
    context,
    channel,
    timeoutSeconds,
    status: "waiting",
    createdAt: new Date().toISOString(),
  };

  approvalStore.set(requestId, request);

  // Send notification (best-effort, failures logged but don't block)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const approveUrl = `${baseUrl}/api/agents/${agentId}/approve?requestId=${requestId}&decision=approved`;
    const denyUrl = `${baseUrl}/api/agents/${agentId}/approve?requestId=${requestId}&decision=denied`;

    switch (channel) {
      case "slack":
        await sendSlackApproval(
          process.env.SLACK_WEBHOOK_URL || "",
          request,
          approveUrl,
          denyUrl
        );
        break;
      case "whatsapp":
        await sendWhatsAppApproval(
          process.env.APPROVAL_WHATSAPP_TO || "",
          request
        );
        break;
      case "in-app":
        await sendInAppNotification(request);
        break;
    }
  } catch (err) {
    console.error(`[approval-manager] Notification failed for ${requestId}:`, err);
  }

  return request;
}

/**
 * Respond to a pending approval request.
 */
export async function respondToApproval(
  requestId: string,
  decision: "approved" | "denied",
  note?: string,
  decidedBy?: string
): Promise<ApprovalRequest> {
  const request = approvalStore.get(requestId);
  if (!request) {
    throw new Error(`Approval request ${requestId} not found`);
  }

  if (request.status !== "waiting") {
    throw new Error(`Approval request ${requestId} is already ${request.status}`);
  }

  const now = new Date().toISOString();
  request.status = decision;
  request.decision = decision;
  request.respondedAt = now;
  request.note = note;
  request.decidedBy = decidedBy || "user";

  approvalStore.set(requestId, request);

  // Add to history
  const entries = historyStore.get(request.agentId) || [];
  entries.push({
    requestId,
    action: request.question,
    decision,
    responseTimeMs: new Date(now).getTime() - new Date(request.createdAt).getTime(),
    decidedBy: decidedBy || "user",
    timestamp: now,
    note,
  });
  historyStore.set(request.agentId, entries);

  return request;
}

/**
 * Get a single approval request by ID.
 */
export async function getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
  return approvalStore.get(requestId) || null;
}

/**
 * List approval requests for an agent, optionally filtered by status.
 */
export async function listApprovals(agentId: string, status?: string): Promise<ApprovalRequest[]> {
  const results: ApprovalRequest[] = [];
  for (const [, req] of approvalStore) {
    if (req.agentId !== agentId) continue;
    if (status && req.status !== status) continue;
    results.push(req);
  }
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get approval history for an agent (past decisions with response times).
 */
export async function getApprovalHistory(agentId: string): Promise<ApprovalHistoryEntry[]> {
  const entries = historyStore.get(agentId) || [];
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
