import { createMcpHandler } from "mcp-handler";
import { registerBugcrowdTools } from "../../../src/tools";
import { runWithBugcrowdCredentials } from "../../../src/request-auth";
import {
  oauthResourceForOrigin,
  protectedResourceMetadataUrlForOrigin,
  resolveAccessToken,
} from "../../../src/oauth";

function toolError(error: unknown, resourceMetadataUrl: string) {
  const message = error instanceof Error ? error.message : String(error);
  const authRequired = message.includes(
    "Missing BUGCROWD_API_USERNAME or BUGCROWD_API_PASSWORD environment variables"
  );

  if (authRequired) {
    const challenge =
      'Bearer resource_metadata="' +
      resourceMetadataUrl +
      '", scope="bugcrowd", error="invalid_token", error_description="Connect your Bugcrowd API credentials to continue."';

    return {
      content: [
        {
          type: "text" as const,
          text: "Authentication required: connect your Bugcrowd API credentials to continue.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [challenge],
      },
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}

function createHandler(resourceMetadataUrl: string) {
  return createMcpHandler(
    (server) => {
      registerBugcrowdTools(server, (error) =>
        toolError(error, resourceMetadataUrl)
      );
    },
    {
      serverInfo: {
        name: "bugcrowd-mcp-server",
        version: "2.0.0",
      },
    }
  );
}

function getBasicCredentials(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("basic ")) return null;

  try {
    const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (!username || !password) return null;

    return { username, password };
  } catch {
    return null;
  }
}

function oauthChallenge(
  resourceMetadataUrl: string,
  resource: string,
  error = "invalid_token",
  description = "Connect your Bugcrowd API credentials with OAuth to continue."
) {
  const challenge =
    'Bearer resource_metadata="' +
    resourceMetadataUrl +
    '", scope="bugcrowd", error="' +
    error.replace(/"/g, "") +
    '", error_description="' +
    description.replace(/"/g, "") +
    '"';

  return new Response(
    JSON.stringify({
      error: "oauth_required",
      error_description: description,
      resource,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "www-authenticate": challenge,
      },
    }
  );
}

async function securedHandler(request: Request) {
  const origin = new URL(request.url).origin;
  const resource = oauthResourceForOrigin(origin);
  const resourceMetadataUrl = protectedResourceMetadataUrlForOrigin(origin);
  const handler = createHandler(resourceMetadataUrl);
  const authorization = request.headers.get("authorization") ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    try {
      const accessToken = authorization.slice(7).trim();
      const credentials = await resolveAccessToken(accessToken, resource);
      return runWithBugcrowdCredentials(credentials, () => handler(request));
    } catch (error: any) {
      return oauthChallenge(
        resourceMetadataUrl,
        resource,
        "invalid_token",
        error?.message || "The OAuth access token is invalid or expired."
      );
    }
  }

  const basicCredentials = getBasicCredentials(request);
  if (basicCredentials) {
    return runWithBugcrowdCredentials(basicCredentials, () => handler(request));
  }

  if (
    process.env.BUGCROWD_API_USERNAME &&
    process.env.BUGCROWD_API_PASSWORD
  ) {
    return handler(request);
  }

  // Keep MCP initialize/tools/list discoverable before account linking.
  // Authenticated operations fail closed inside tool handlers and return
  // the MCP OAuth challenge in _meta["mcp/www_authenticate"].
  return handler(request);
}

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 60;

export {
  securedHandler as GET,
  securedHandler as POST,
  securedHandler as DELETE,
};
