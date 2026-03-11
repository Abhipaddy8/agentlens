/**
 * GET /api/integrations/[service]/auth
 *
 * Redirects the browser to the OAuth provider's authorization URL.
 * Uses env vars for client IDs. If not configured, returns a JSON
 * response explaining what needs to be set up.
 */

import { NextRequest, NextResponse } from "next/server";

interface OAuthConfig {
  authUrl: string;
  clientIdEnv: string;
  scopes: string[];
  extraParams?: Record<string, string>;
  displayName: string;
}

const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  hubspot: {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read"],
    displayName: "HubSpot",
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    clientIdEnv: "SLACK_CLIENT_ID",
    scopes: ["chat:write", "channels:read", "users:read"],
    displayName: "Slack",
  },
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    extraParams: {
      access_type: "offline",
      prompt: "consent",
    },
    displayName: "Google",
  },
  salesforce: {
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    clientIdEnv: "SALESFORCE_CLIENT_ID",
    scopes: ["api", "refresh_token"],
    extraParams: {
      response_type: "code",
    },
    displayName: "Salesforce",
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params;
  const config = OAUTH_CONFIGS[service];

  if (!config) {
    return NextResponse.json(
      { error: `Unknown OAuth service: ${service}. Supported: ${Object.keys(OAUTH_CONFIGS).join(", ")}` },
      { status: 404 }
    );
  }

  const clientId = process.env[config.clientIdEnv];

  if (!clientId) {
    return NextResponse.json(
      {
        error: "OAuth not configured",
        service,
        displayName: config.displayName,
        setup: {
          message: `Set the following environment variables to enable ${config.displayName} OAuth:`,
          required: [
            `${config.clientIdEnv}=your_client_id`,
            `${config.clientIdEnv.replace("_ID", "_SECRET")}=your_client_secret`,
          ],
          callbackUrl: `${getBaseUrl(req)}/api/integrations/${service}/callback`,
          scopes: config.scopes,
        },
      },
      { status: 501 }
    );
  }

  // Build the redirect URI
  const callbackUrl = `${getBaseUrl(req)}/api/integrations/${service}/callback`;

  // Get session ID from query params (passed by frontend)
  const sessionId = req.nextUrl.searchParams.get("sessionId") || "default";

  // Build authorization URL
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", sessionId);

  // Default response_type for OAuth 2.0
  if (!config.extraParams?.response_type) {
    authUrl.searchParams.set("response_type", "code");
  }

  // Apply any extra params
  if (config.extraParams) {
    for (const [key, value] of Object.entries(config.extraParams)) {
      authUrl.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(authUrl.toString());
}

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
