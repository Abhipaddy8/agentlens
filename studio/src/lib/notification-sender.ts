/**
 * AgentLens Studio — Notification Sender
 *
 * Sends approval request notifications via Slack, WhatsApp, or in-app.
 * All sending is best-effort — failures are logged but don't block the caller.
 *
 * @module lib/notification-sender
 */

import { ApprovalRequest } from "./types";

// --- In-app notification queue (picked up by chat UI via SSE) ---

const inAppQueue: ApprovalRequest[] = [];

/**
 * Get and drain pending in-app notifications.
 */
export function drainInAppNotifications(): ApprovalRequest[] {
  const pending = [...inAppQueue];
  inAppQueue.length = 0;
  return pending;
}

/**
 * Send an approval request via Slack webhook with Block Kit buttons.
 */
export async function sendSlackApproval(
  webhookUrl: string,
  request: ApprovalRequest,
  approveUrl: string,
  denyUrl: string
): Promise<boolean> {
  if (!webhookUrl) {
    console.warn("[notification-sender] SLACK_WEBHOOK_URL not configured, skipping Slack notification");
    return false;
  }

  const payload = {
    text: `Approval Required: ${request.question}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Approval Required`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Agent*: ${request.agentName}\n*Action*: ${request.question}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Context*: ${request.context}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Request ID*: \`${request.requestId}\`\n*Timeout*: ${Math.round(request.timeoutSeconds / 60)} minutes`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve" },
            style: "primary",
            action_id: `approve_${request.requestId}`,
            url: approveUrl,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Deny" },
            style: "danger",
            action_id: `deny_${request.requestId}`,
            url: denyUrl,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[notification-sender] Slack webhook returned ${res.status}`);
      return false;
    }

    console.log(`[notification-sender] Slack notification sent for ${request.requestId}`);
    return true;
  } catch (err) {
    console.error(`[notification-sender] Slack send failed:`, err);
    return false;
  }
}

/**
 * Send an approval request via WhatsApp using Twilio API.
 */
export async function sendWhatsAppApproval(
  to: string,
  request: ApprovalRequest
): Promise<boolean> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!twilioSid || !twilioToken || !fromNumber || !to) {
    console.warn("[notification-sender] WhatsApp (Twilio) credentials not configured, skipping");
    return false;
  }

  const message =
    `Approval Required\n\n` +
    `Agent: ${request.agentName}\n` +
    `Action: ${request.question}\n` +
    `Context: ${request.context}\n\n` +
    `Reply "APPROVE ${request.requestId.slice(0, 8)}" or "DENY ${request.requestId.slice(0, 8)}"`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");

  const body = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${to}`,
    Body: message,
  }).toString();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body,
    });

    if (!res.ok) {
      console.error(`[notification-sender] Twilio WhatsApp returned ${res.status}`);
      return false;
    }

    console.log(`[notification-sender] WhatsApp notification sent for ${request.requestId}`);
    return true;
  } catch (err) {
    console.error(`[notification-sender] WhatsApp send failed:`, err);
    return false;
  }
}

/**
 * Store an in-app notification for the chat UI to pick up.
 */
export async function sendInAppNotification(request: ApprovalRequest): Promise<void> {
  inAppQueue.push(request);
  console.log(`[notification-sender] In-app notification queued for ${request.requestId}`);
}
