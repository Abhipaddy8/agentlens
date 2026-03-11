/**
 * GET /api/integrations/[service]/callback
 *
 * OAuth callback handler. Exchanges the authorization code for an access token,
 * stores it via credential-store, and returns HTML that notifies the opener
 * window via postMessage then closes itself.
 */

import { NextRequest } from "next/server";
import { storeCredential } from "@/lib/credential-store";

interface TokenEndpointConfig {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  displayName: string;
}

const TOKEN_CONFIGS: Record<string, TokenEndpointConfig> = {
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    displayName: "HubSpot",
  },
  slack: {
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    displayName: "Slack",
  },
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    displayName: "Google",
  },
  salesforce: {
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    clientIdEnv: "SALESFORCE_CLIENT_ID",
    clientSecretEnv: "SALESFORCE_CLIENT_SECRET",
    displayName: "Salesforce",
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params;
  const config = TOKEN_CONFIGS[service];

  if (!config) {
    return errorHtml(`Unknown service: ${service}`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const sessionId = req.nextUrl.searchParams.get("state") || "default";
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return errorHtml(`OAuth error: ${error}`);
  }

  if (!code) {
    return errorHtml("No authorization code received");
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return errorHtml(`OAuth credentials not configured for ${config.displayName}`);
  }

  try {
    // Build callback URL for the token exchange
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/integrations/${service}/callback`;

    // Exchange code for token
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      return errorHtml(`Token exchange failed: ${errBody}`);
    }

    const tokenData = await tokenResponse.json();

    // Extract token — different providers use different field names
    const accessToken =
      tokenData.access_token ||
      tokenData.authed_user?.access_token || // Slack v2
      "";

    if (!accessToken) {
      return errorHtml("No access token in response");
    }

    // Calculate expiry if provided
    let expiresAt: string | undefined;
    if (tokenData.expires_in) {
      expiresAt = new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString();
    }

    // Store the credential
    storeCredential(sessionId, service, {
      type: "oauth_token",
      value: accessToken,
      expiresAt,
      metadata: {
        refreshToken: tokenData.refresh_token || "",
        scope: tokenData.scope || "",
        tokenType: tokenData.token_type || "Bearer",
      },
    });

    // Success HTML — notify opener and close
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>${config.displayName} Connected</title></head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
  <div style="text-align: center;">
    <div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
    <h2>${config.displayName} connected successfully</h2>
    <p style="color: #888;">This window will close automatically...</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: "oauth-success",
        service: "${service}",
        displayName: "${config.displayName}"
      }, "*");
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorHtml(`Token exchange error: ${message}`);
  }
}

function errorHtml(message: string) {
  return new Response(
    `<!DOCTYPE html>
<html>
<head><title>Connection Failed</title></head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
  <div style="text-align: center;">
    <div style="font-size: 48px; margin-bottom: 16px;">&#10007;</div>
    <h2>Connection failed</h2>
    <p style="color: #f87171;">${message}</p>
    <p style="color: #888; margin-top: 16px;">Close this window and try again.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: "oauth-error",
        error: ${JSON.stringify(message)}
      }, "*");
    }
  </script>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }
  );
}
