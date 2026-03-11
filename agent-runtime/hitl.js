/**
 * AgentLens Agent Runtime — Human-in-the-Loop Module
 *
 * Enables agents to pause at decision points and request human approval
 * before proceeding with sensitive actions (email sends, DB writes, etc.).
 *
 * Flow:
 * 1. Agent reaches a decision point
 * 2. Checks if action requires approval (via config)
 * 3. Sends approval request to configured channel (Slack/WhatsApp/email)
 * 4. Polls for response (with timeout)
 * 5. Resumes or halts based on human decision
 *
 * @module agent-runtime/hitl
 */

const { v4: uuidv4 } = require("uuid");
const https = require("https");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const APPROVAL_TABLE = process.env.APPROVAL_TABLE || "agentlens-approvals";

/** @enum {string} */
const ApprovalStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  TIMEOUT: "timeout",
};

/**
 * Check if a given action requires human approval based on the agent config.
 *
 * @param {string} action - Action name (e.g., "send-email", "delete-record")
 * @param {object} hitlConfig - humanInTheLoop config from agentlens-agent.json
 * @param {boolean} hitlConfig.enabled - Whether HITL is enabled
 * @param {string[]} hitlConfig.actions - List of actions that require approval
 * @returns {boolean} True if this action needs human approval
 */
function isApprovalRequired(action, hitlConfig) {
  if (!hitlConfig || !hitlConfig.enabled) {
    return false;
  }

  if (!hitlConfig.actions || hitlConfig.actions.length === 0) {
    return false;
  }

  // Check exact match or wildcard
  return hitlConfig.actions.includes(action) || hitlConfig.actions.includes("*");
}

/**
 * Send an approval request to the configured channel.
 * Stores the request in DynamoDB and sends a notification.
 *
 * @param {string} action - Action name requiring approval
 * @param {string} channel - Approval channel: "slack", "whatsapp", or "email"
 * @param {object} details - Action details to show the human
 * @param {string} details.agentId - Agent requesting approval
 * @param {string} details.summary - Plain English summary of what the agent wants to do
 * @param {object} [details.payload] - The actual payload that will be executed (for review)
 * @param {string} [details.urgency="normal"] - "low", "normal", or "high"
 * @returns {Promise<string>} Request ID for polling
 */
async function requestApproval(action, channel, details) {
  const requestId = uuidv4();
  const now = new Date().toISOString();

  const approvalRecord = {
    requestId,
    agentId: details.agentId,
    action,
    channel,
    summary: details.summary,
    payload: details.payload ? JSON.stringify(details.payload) : null,
    urgency: details.urgency || "normal",
    status: ApprovalStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    // Auto-expire after 24 hours
    ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  };

  // Store in DynamoDB
  try {
    await ddb.send(
      new PutCommand({
        TableName: APPROVAL_TABLE,
        Item: approvalRecord,
      })
    );
  } catch (err) {
    console.error(`[hitl] Failed to store approval request: ${err.message}`);
    throw new Error(`Failed to create approval request: ${err.message}`);
  }

  // Send notification to the appropriate channel
  try {
    switch (channel) {
      case "slack":
        await sendSlackApproval(requestId, action, details);
        break;
      case "whatsapp":
        await sendWhatsAppApproval(requestId, action, details);
        break;
      case "email":
        await sendEmailApproval(requestId, action, details);
        break;
      default:
        console.warn(`[hitl] Unknown channel "${channel}", notification not sent`);
    }
  } catch (err) {
    console.error(`[hitl] Failed to send ${channel} notification: ${err.message}`);
    // Don't throw — the approval record exists, human can check the dashboard
  }

  console.log(
    `[hitl] Approval requested: id=${requestId} action="${action}" channel=${channel} agent=${details.agentId}`
  );

  return requestId;
}

/**
 * Poll for an approval response. Checks DynamoDB at intervals until
 * the request is approved, rejected, or the timeout expires.
 *
 * @param {string} requestId - Approval request ID
 * @param {number} [timeoutMs=300000] - Maximum time to wait (default: 5 minutes)
 * @param {number} [pollIntervalMs=5000] - How often to check (default: 5 seconds)
 * @returns {Promise<{status: string, respondedBy: string|null, respondedAt: string|null}>}
 */
async function waitForApproval(requestId, timeoutMs = 300000, pollIntervalMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  console.log(
    `[hitl] Waiting for approval: id=${requestId} timeout=${Math.round(timeoutMs / 1000)}s`
  );

  while (Date.now() < deadline) {
    try {
      const result = await ddb.send(
        new GetCommand({
          TableName: APPROVAL_TABLE,
          Key: { requestId },
        })
      );

      const item = result.Item;
      if (!item) {
        throw new Error(`Approval request ${requestId} not found`);
      }

      if (item.status !== ApprovalStatus.PENDING) {
        console.log(
          `[hitl] Approval resolved: id=${requestId} status=${item.status} by=${item.respondedBy || "unknown"}`
        );
        return {
          status: item.status,
          respondedBy: item.respondedBy || null,
          respondedAt: item.respondedAt || null,
        };
      }
    } catch (err) {
      console.error(`[hitl] Poll error: ${err.message}`);
      // Continue polling — transient errors shouldn't stop waiting
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout — mark the request as timed out
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: APPROVAL_TABLE,
        Key: { requestId },
        UpdateExpression: "SET #s = :status, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": ApprovalStatus.TIMEOUT,
          ":now": new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    console.warn(`[hitl] Failed to update timeout status: ${err.message}`);
  }

  console.log(`[hitl] Approval timed out: id=${requestId}`);

  return {
    status: ApprovalStatus.TIMEOUT,
    respondedBy: null,
    respondedAt: null,
  };
}

/**
 * Respond to an approval request (called by webhook from Slack/WhatsApp/dashboard).
 *
 * @param {string} requestId - Approval request ID
 * @param {string} status - "approved" or "rejected"
 * @param {string} respondedBy - Who responded (name or ID)
 * @returns {Promise<void>}
 */
async function respondToApproval(requestId, status, respondedBy) {
  if (status !== ApprovalStatus.APPROVED && status !== ApprovalStatus.REJECTED) {
    throw new Error(`Invalid status: ${status}. Must be "approved" or "rejected".`);
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: APPROVAL_TABLE,
        Key: { requestId },
        UpdateExpression: "SET #s = :status, respondedBy = :by, respondedAt = :now, updatedAt = :now",
        ConditionExpression: "#s = :pending",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": status,
          ":by": respondedBy,
          ":now": new Date().toISOString(),
          ":pending": ApprovalStatus.PENDING,
        },
      })
    );

    console.log(`[hitl] Approval responded: id=${requestId} status=${status} by=${respondedBy}`);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      console.warn(`[hitl] Approval ${requestId} already responded to or expired`);
      return;
    }
    throw err;
  }
}

/**
 * Convenience wrapper: check if approval is needed, request it, wait for it.
 * Returns the approval result. If no approval needed, returns auto-approved.
 *
 * @param {string} action - Action name
 * @param {object} hitlConfig - humanInTheLoop config
 * @param {object} details - Action details
 * @param {number} [timeoutMs=300000] - Timeout for waiting
 * @returns {Promise<{approved: boolean, requestId: string|null, respondedBy: string|null}>}
 */
async function requireApproval(action, hitlConfig, details, timeoutMs = 300000) {
  if (!isApprovalRequired(action, hitlConfig)) {
    return { approved: true, requestId: null, respondedBy: "auto" };
  }

  const channel = hitlConfig.approvalChannel || "slack";
  const requestId = await requestApproval(action, channel, details);
  const result = await waitForApproval(requestId, timeoutMs);

  return {
    approved: result.status === ApprovalStatus.APPROVED,
    requestId,
    respondedBy: result.respondedBy,
    status: result.status,
  };
}

// --- Channel-Specific Notification Senders ---

/**
 * Send approval request via Slack webhook.
 * @param {string} requestId
 * @param {string} action
 * @param {object} details
 * @returns {Promise<void>}
 */
async function sendSlackApproval(requestId, action, details) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[hitl] SLACK_WEBHOOK_URL not set, skipping Slack notification");
    return;
  }

  const urgencyEmoji = {
    low: "",
    normal: "",
    high: "URGENT ",
  };

  const payload = {
    text: `${urgencyEmoji[details.urgency || "normal"]}Approval Required`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Approval Required: ${action}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Agent*: ${details.agentId}\n*Action*: ${action}\n*Summary*: ${details.summary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Request ID*: \`${requestId}\``,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve" },
            style: "primary",
            action_id: `approve_${requestId}`,
            value: requestId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Reject" },
            style: "danger",
            action_id: `reject_${requestId}`,
            value: requestId,
          },
        ],
      },
    ],
  };

  await postJSON(webhookUrl, payload);
}

/**
 * Send approval request via WhatsApp (Twilio API).
 * @param {string} requestId
 * @param {string} action
 * @param {object} details
 * @returns {Promise<void>}
 */
async function sendWhatsAppApproval(requestId, action, details) {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  const toNumber = process.env.APPROVAL_WHATSAPP_TO;

  if (!twilioSid || !twilioToken || !fromNumber || !toNumber) {
    console.warn("[hitl] WhatsApp (Twilio) credentials not configured, skipping notification");
    return;
  }

  const message =
    `Approval Required\n\n` +
    `Agent: ${details.agentId}\n` +
    `Action: ${action}\n` +
    `Summary: ${details.summary}\n\n` +
    `Reply "APPROVE ${requestId.slice(0, 8)}" or "REJECT ${requestId.slice(0, 8)}"`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");

  const body = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${toNumber}`,
    Body: message,
  }).toString();

  await new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`WhatsApp send failed: ${res.statusCode} ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send approval request via email (placeholder — implement with SES/Gmail).
 * @param {string} requestId
 * @param {string} action
 * @param {object} details
 * @returns {Promise<void>}
 */
async function sendEmailApproval(requestId, action, details) {
  // Email approval is a stub — implement with AWS SES or Gmail API
  console.log(
    `[hitl] Email approval requested (stub): id=${requestId} action=${action} to=${process.env.APPROVAL_EMAIL || "not configured"}`
  );
  // In production, send an email with approve/reject links that call the respondToApproval endpoint
}

// --- Utility ---

/**
 * POST JSON to a URL.
 * @param {string} url
 * @param {object} payload
 * @returns {Promise<void>}
 */
function postJSON(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(data);
    req.end();
  });
}

module.exports = {
  isApprovalRequired,
  requestApproval,
  waitForApproval,
  respondToApproval,
  requireApproval,
  ApprovalStatus,
  APPROVAL_TABLE,
};
