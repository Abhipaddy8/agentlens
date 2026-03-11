/**
 * POST /api/integrations/connect
 *
 * Connect an integration via API key.
 * Body: { sessionId, service, apiKey }
 *
 * Validates key format (basic checks per service), stores via credential-store,
 * returns { connected: true, service, displayName }.
 */

import { NextRequest, NextResponse } from "next/server";
import { storeCredential } from "@/lib/credential-store";

/** Basic format validation per service. */
const KEY_VALIDATORS: Record<string, (key: string) => boolean> = {
  stripe: (k) => k.startsWith("sk_") || k.startsWith("rk_"),
  twilio: (k) => k.length >= 32,
  sendgrid: (k) => k.startsWith("SG."),
  openai: (k) => k.startsWith("sk-") && k.length > 20,
};

const DISPLAY_NAMES: Record<string, string> = {
  stripe: "Stripe",
  twilio: "Twilio",
  sendgrid: "SendGrid",
  openai: "OpenAI",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, service, apiKey } = body;

    if (!sessionId || !service || !apiKey) {
      return NextResponse.json(
        { error: "sessionId, service, and apiKey are required" },
        { status: 400 }
      );
    }

    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: "apiKey must be a non-empty string" },
        { status: 400 }
      );
    }

    // Validate key format if we have a validator for this service
    const validator = KEY_VALIDATORS[service];
    if (validator && !validator(apiKey.trim())) {
      return NextResponse.json(
        {
          error: `Invalid API key format for ${DISPLAY_NAMES[service] || service}. Please check your key and try again.`,
        },
        { status: 422 }
      );
    }

    // Store the credential
    storeCredential(sessionId, service, {
      type: "api_key",
      value: apiKey.trim(),
    });

    return NextResponse.json({
      connected: true,
      service,
      displayName: DISPLAY_NAMES[service] || service,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
