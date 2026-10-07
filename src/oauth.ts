import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getCache } from "@vercel/functions";

const fallbackHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "localhost:3000";

const fallbackOrigin = fallbackHost === "localhost:3000"
  ? "http://localhost:3000"
  : `https://${fallbackHost}`;

export const OAUTH_ISSUER = (
  process.env.OAUTH_ISSUER || fallbackOrigin
).replace(/\/+$/, "");

export const OAUTH_RESOURCE =
  process.env.OAUTH_RESOURCE || `${OAUTH_ISSUER}/api/mcp`;

export const PROTECTED_RESOURCE_METADATA_URL =
  `${OAUTH_ISSUER}/.well-known/oauth-protected-resource`;

export function oauthIssuerForOrigin(origin?: string) {
  const configured = process.env.OAUTH_ISSUER?.trim();
  return (configured || origin || OAUTH_ISSUER).replace(/\/+$/, "");
}

export function oauthResourceForOrigin(origin?: string) {
  const configured = process.env.OAUTH_RESOURCE?.trim();
  return configured || `${oauthIssuerForOrigin(origin)}/api/mcp`;
}

export function protectedResourceMetadataUrlForOrigin(origin?: string) {
  return `${oauthIssuerForOrigin(origin)}/.well-known/oauth-protected-resource`;
}

export const OAUTH_SCOPE = "bugcrowd";
export const OFFLINE_SCOPE = "offline_access";

const AUTH_CODE_TTL = 5 * 60;
const ACCESS_TOKEN_TTL = 60 * 60;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;

type BugcrowdCredentials = {
  username: string;
  password: string;
};

export type OAuthGrant = BugcrowdCredentials & {
  clientId: string;
  resource: string;
  scope: string;
};

export type AuthorizationCodeRecord = OAuthGrant & {
  redirectUri: string;
  codeChallenge: string;
};

function oauthCache() {
  return getCache({
    namespace: "bugcrowd-mcp-oauth",
    namespaceSeparator: ":",
  });
}

function tokenKey(kind: "code" | "access" | "refresh", token: string) {
  const digest = createHash("sha256").update(token, "utf8").digest("hex");
  return `${kind}:${digest}`;
}

function opaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

async function putRecord(
  kind: "code" | "access" | "refresh",
  ttl: number,
  value: object
) {
  const token = opaqueToken(kind);
  await oauthCache().set(tokenKey(kind, token), value, {
    ttl,
    tags: ["bugcrowd-mcp-oauth"],
    name: `bugcrowd-mcp-oauth-${kind}`,
  });
  return token;
}

async function getRecord<T>(
  kind: "code" | "access" | "refresh",
  token: string
): Promise<T> {
  if (!token || token.length < 20) throw new Error("Malformed OAuth token.");
  const value = (await oauthCache().get(tokenKey(kind, token))) as T | undefined;
  if (!value) {
    throw new Error("OAuth token is invalid, expired, or no longer active.");
  }
  return value;
}

export async function createAuthorizationCode(input: AuthorizationCodeRecord) {
  return putRecord("code", AUTH_CODE_TTL, input);
}

export async function readAuthorizationCode(code: string) {
  return getRecord<AuthorizationCodeRecord>("code", code);
}

export async function consumeAuthorizationCode(code: string) {
  await oauthCache().delete(tokenKey("code", code));
}

export async function createAccessToken(input: OAuthGrant) {
  return putRecord("access", ACCESS_TOKEN_TTL, input);
}

export async function resolveAccessToken(
  token: string,
  expectedResource = OAUTH_RESOURCE
): Promise<BugcrowdCredentials> {
  const payload = await getRecord<OAuthGrant>("access", token);
  if (payload.resource !== expectedResource) {
    throw new Error("OAuth token audience does not match this MCP server.");
  }
  if (!payload.scope.split(/\s+/).includes(OAUTH_SCOPE)) {
    throw new Error("OAuth token does not include the required Bugcrowd scope.");
  }
  return { username: payload.username, password: payload.password };
}

export async function createRefreshToken(input: OAuthGrant) {
  return putRecord("refresh", REFRESH_TOKEN_TTL, input);
}

export async function readRefreshToken(token: string) {
  return getRecord<OAuthGrant>("refresh", token);
}

export async function consumeRefreshToken(token: string) {
  await oauthCache().delete(tokenKey("refresh", token));
}

export function verifyPkce(verifier: string, challenge: string) {
  const computed = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  const left = Buffer.from(computed, "utf8");
  const right = Buffer.from(challenge, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeScope(scope?: string | null) {
  const requested = new Set(
    (scope || OAUTH_SCOPE)
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  requested.add(OAUTH_SCOPE);
  return [
    OAUTH_SCOPE,
    ...(requested.has(OFFLINE_SCOPE) ? [OFFLINE_SCOPE] : []),
  ].join(" ");
}

export function isAllowedClientId(clientId: string) {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return false;
    return (
      url.pathname === "/oauth/client.json" ||
      /^\/oauth\/[^/]+\/client\.json$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isAllowedRedirectUri(redirectUri: string) {
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return false;
    return (
      url.pathname === "/connector_platform_oauth_redirect" ||
      /^\/connector\/oauth\/[^/]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function verifyBugcrowdCredentials(
  username: string,
  password: string
) {
  const url = new URL("https://api.bugcrowd.com/programs");
  url.searchParams.set("page[limit]", "1");

  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${username}:${password}`,
      Accept: "application/vnd.bugcrowd+json",
      "User-Agent": "bugcrowd-mcp-oauth/2.0",
    },
    cache: "no-store",
  });

  if (response.status === 429) {
    throw new Error(
      "Bugcrowd rate-limited credential verification. Try authorizing again shortly."
    );
  }

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Bugcrowd rejected that API key/API secret."
        : `Bugcrowd credential verification failed with HTTP ${response.status}.`
    );
  }

  return { username, authenticated: true };
}

export function protectedResourceMetadata(origin?: string) {
  const issuer = oauthIssuerForOrigin(origin);
  const resource = oauthResourceForOrigin(origin);
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [OAUTH_SCOPE, OFFLINE_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer}/`,
  };
}

export function authorizationServerMetadata(origin?: string) {
  const issuer = oauthIssuerForOrigin(origin);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [OAUTH_SCOPE, OFFLINE_SCOPE],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${issuer}/`,
  };
}
