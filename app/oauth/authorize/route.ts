import {
  OAUTH_ISSUER,
  OAUTH_RESOURCE,
  createAuthorizationCode,
  isAllowedClientId,
  isAllowedRedirectUri,
  normalizeScope,
  verifyBugcrowdCredentials,
} from "../../../src/oauth";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

type OAuthFields = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  resource: string;
  scope: string;
};

function validate(fields: OAuthFields) {
  if (fields.response_type !== "code") {
    return "Only response_type=code is supported.";
  }
  if (!isAllowedClientId(fields.client_id)) {
    return "Unsupported OAuth client.";
  }
  if (!isAllowedRedirectUri(fields.redirect_uri)) {
    return "Unsupported redirect URI.";
  }
  if (!fields.code_challenge || fields.code_challenge_method !== "S256") {
    return "PKCE S256 is required.";
  }
  if (fields.resource !== OAUTH_RESOURCE) {
    return "OAuth resource does not match this MCP server.";
  }
  return null;
}

function fieldsFromUrl(url: URL): OAuthFields {
  return {
    response_type: url.searchParams.get("response_type") || "",
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method:
      url.searchParams.get("code_challenge_method") || "",
    state: url.searchParams.get("state") || "",
    resource: url.searchParams.get("resource") || "",
    scope: normalizeScope(url.searchParams.get("scope")),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function authorizationPage(fields: OAuthFields, error?: string) {
  const hidden = Object.entries(fields)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(
          value
        )}">`
    )
    .join("");

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect Bugcrowd</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0b0d10; color:#f5f7fa; padding:20px; }
    main { width:min(520px,100%); background:#14181d; border:1px solid #2b3139; border-radius:18px; padding:26px; box-shadow:0 24px 70px rgba(0,0,0,.35); }
    h1 { margin:0 0 8px; font-size:26px; }
    p { color:#b7c0cb; line-height:1.5; }
    label { display:block; margin:18px 0 7px; font-weight:650; }
    input { width:100%; background:#0e1115; color:#fff; border:1px solid #38414c; border-radius:10px; padding:13px 14px; font-size:16px; }
    button { width:100%; margin-top:22px; border:0; border-radius:11px; padding:14px 16px; font-size:16px; font-weight:750; background:#ff5a36; color:#111; cursor:pointer; }
    a { color:#8fc7ff; }
    .error { background:#3b1717; border:1px solid #7c2b2b; color:#ffb8b8; border-radius:10px; padding:12px; }
    .small { font-size:13px; color:#8f9aa6; }
    code { color:#d5dde7; }
  </style>
</head>
<body>
<main>
  <h1>Connect Bugcrowd</h1>
  <p>Authorize ChatGPT using a Bugcrowd API key and API secret. The secret is verified directly with <code>api.bugcrowd.com</code>, stored only server-side for the OAuth grant, and is never returned to ChatGPT.</p>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
  <form method="post" action="/oauth/authorize" autocomplete="off">
    ${hidden}
    <label for="api_key">Bugcrowd API key</label>
    <input id="api_key" name="api_key" type="text" required autocapitalize="none" spellcheck="false">
    <label for="api_secret">Bugcrowd API secret</label>
    <input id="api_secret" name="api_secret" type="password" required>
    <button type="submit">Verify & authorize ChatGPT</button>
  </form>
  <p class="small">Bugcrowd uses API token credentials rather than a public third-party OAuth authorization endpoint. Create/manage API credentials in your Bugcrowd account, then enter them here.</p>
  <p class="small"><a href="https://docs.bugcrowd.com/api/getting-started/" target="_blank" rel="noreferrer">Bugcrowd API authentication documentation</a></p>
</main>
</body>
</html>`,
    {
      status: error ? 401 : 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none';",
      },
    }
  );
}

async function authorize(
  fields: OAuthFields,
  apiKey: string,
  apiSecret: string
) {
  const validationError = validate(fields);
  if (validationError) {
    return Response.json(
      { error: "invalid_request", error_description: validationError },
      { status: 400 }
    );
  }

  if (!apiKey || !apiSecret) {
    return authorizationPage(fields, "API key and API secret are required.");
  }

  try {
    await verifyBugcrowdCredentials(apiKey, apiSecret);
  } catch (error: any) {
    return authorizationPage(
      fields,
      error?.message || "Bugcrowd credential verification failed."
    );
  }

  const code = await createAuthorizationCode({
    username: apiKey,
    password: apiSecret,
    clientId: fields.client_id,
    redirectUri: fields.redirect_uri,
    resource: fields.resource,
    codeChallenge: fields.code_challenge,
    scope: fields.scope,
  });

  const redirect = new URL(fields.redirect_uri);
  redirect.searchParams.set("code", code);
  if (fields.state) redirect.searchParams.set("state", fields.state);
  redirect.searchParams.set("iss", OAUTH_ISSUER);

  return Response.redirect(redirect.toString(), 302);
}

export async function GET(request: Request) {
  const fields = fieldsFromUrl(new URL(request.url));
  const validationError = validate(fields);

  if (validationError) {
    return Response.json(
      { error: "invalid_request", error_description: validationError },
      { status: 400 }
    );
  }

  const envKey = process.env.BUGCROWD_API_USERNAME?.trim();
  const envSecret = process.env.BUGCROWD_API_PASSWORD?.trim();

  if (
    process.env.BUGCROWD_OAUTH_AUTO_AUTHORIZE === "1" &&
    envKey &&
    envSecret
  ) {
    return authorize(fields, envKey, envSecret);
  }

  return authorizationPage(fields);
}

export async function POST(request: Request) {
  const form = await request.formData();

  const fields: OAuthFields = {
    response_type: String(form.get("response_type") || ""),
    client_id: String(form.get("client_id") || ""),
    redirect_uri: String(form.get("redirect_uri") || ""),
    code_challenge: String(form.get("code_challenge") || ""),
    code_challenge_method: String(
      form.get("code_challenge_method") || ""
    ),
    state: String(form.get("state") || ""),
    resource: String(form.get("resource") || ""),
    scope: normalizeScope(String(form.get("scope") || "")),
  };

  return authorize(
    fields,
    String(form.get("api_key") || "").trim(),
    String(form.get("api_secret") || "").trim()
  );
}
