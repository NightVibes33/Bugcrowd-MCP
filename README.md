# Bugcrowd MCP Server

> **Disclaimer:** This is an unofficial, community-built project. It is not affiliated with, endorsed by, or maintained by Bugcrowd. “Bugcrowd” is a trademark of Bugcrowd Inc.

A ChatGPT-ready remote MCP server for the current Bugcrowd REST API. It replaces the original Python/stdin-only prototype with a Vercel/Next.js MCP endpoint, OAuth 2.1 + PKCE for ChatGPT, opaque server-side credentials, public engagement lookup, curated program/submission tools, and a constrained full-fidelity Bugcrowd API request tool.

## API alignment

This repository is aligned with **Bugcrowd API v1.1.0** and reviewed through **2026-10-07**.

The server sends the required Bugcrowd media type:

```text
Accept: application/vnd.bugcrowd+json
```

Bugcrowd moved from date-based versions to semantic API versioning. The server therefore does **not** send the old `Bugcrowd-Version: 2025-04-23` header by default. The generic request tool can still send an explicit version header when needed.

## Remote MCP

After deploying to Vercel, use:

```text
https://<your-production-host>/api/mcp
```

Health check:

```text
https://<your-production-host>/api/health
```

OAuth discovery:

```text
https://<your-production-host>/.well-known/oauth-protected-resource
https://<your-production-host>/.well-known/oauth-authorization-server
```

`/mcp` and `/.well-known/mcp` also rewrite to `/api/mcp`.

## ChatGPT authentication

Bugcrowd's REST API uses per-user API token credentials (`Token <API key>:<API secret>`). Bugcrowd does not expose a general third-party OAuth authorization endpoint that this community MCP can redirect through.

To give ChatGPT the same account-linking experience as a remote OAuth MCP without exposing the Bugcrowd secret to ChatGPT:

1. ChatGPT starts an OAuth 2.1 authorization-code flow with PKCE.
2. This MCP shows its own **Connect Bugcrowd** authorization page.
3. Enter your Bugcrowd API key and API secret on that page.
4. The server verifies the credentials directly against `api.bugcrowd.com`.
5. The credentials are stored only in Vercel Runtime Cache as part of the active grant.
6. ChatGPT receives opaque access and refresh tokens, never the Bugcrowd API secret.

The OAuth layer supports:

- Authorization code flow
- PKCE with `S256`
- Client ID Metadata Documents (CIMD)
- ChatGPT connector redirect URIs
- RFC 8707 resource binding
- RFC 9207 authorization-response issuer
- Expiring opaque access tokens
- Refresh-token rotation

HTTP Basic auth is also accepted for compatible direct clients. A private deployment may instead set `BUGCROWD_API_USERNAME` and `BUGCROWD_API_PASSWORD` as Vercel environment variables.

## Researcher/public-program workflow

The tool catalog separates two things deliberately:

- **Public engagement context:** `get_public_engagement` works without authentication and can retrieve a public program page such as `https://bugcrowd.com/engagements/openai`.
- **Official Bugcrowd REST API operations:** the remaining tools use the connected Bugcrowd API credentials and are limited to whatever those credentials are actually authorized to read or change.

This server does not invent undocumented researcher-portal endpoints or attempt to bypass Bugcrowd account, role, submission, or program restrictions. If a researcher account is not granted API access for an operation, the API response is returned as-is and the public program page can still be used for scope/policy context.

## Tools

### Public

| Tool | Description |
|---|---|
| `get_public_engagement` | Fetch a public `/engagements/<slug>` page without Bugcrowd API authentication |

### Programs and scope

| Tool | Description |
|---|---|
| `list_programs` | List API-visible programs |
| `get_program` | Get one program |
| `list_engagements` | List API-visible engagements |
| `get_engagement` | Get one engagement |
| `list_targets` | List targets/assets |
| `list_target_groups` | List target groups |

### Submissions

| Tool | Description |
|---|---|
| `list_submissions` | List/filter submissions |
| `search_submissions` | Use the v1.1.0 `POST /submissions/search` endpoint |
| `get_submission` | Get a submission |
| `get_submission_with_conversation` | Fetch submission + activities + comments |
| `create_submission` | POST a complete documented JSON:API submission payload when credentials permit |
| `update_submission` | PATCH a documented submission payload when credentials permit |

### Rewards and payments

| Tool | Description |
|---|---|
| `list_monetary_rewards` | List monetary rewards; v1.1.0 includes current funding-pool support |
| `list_payments` | List payments |

### Full API coverage

| Tool | Description |
|---|---|
| `bugcrowd_api_request` | Call any current documented `api.bugcrowd.com` REST path using GET/POST/PUT/PATCH/DELETE |

The generic tool is intentionally constrained to relative paths on `https://api.bugcrowd.com`; it cannot be used as an arbitrary-host HTTP client.

## Deploy to Vercel

The project is configured for Next.js on Vercel and pins its Functions to `iad1` so OAuth authorization, token exchange, Runtime Cache, and MCP requests use one region consistently.

1. Import this GitHub repository into Vercel.
2. Deploy the `main` branch.
3. No Bugcrowd credential is required at deploy time if each ChatGPT user will connect through the OAuth authorization page.
4. Optionally set:
   - `OAUTH_ISSUER=https://your-production-host`
   - `OAUTH_RESOURCE=https://your-production-host/api/mcp`

If `OAUTH_ISSUER` is omitted, the server derives it from Vercel's production project URL.

### Optional private deployment credentials

For a single-user/private deployment you may set:

```text
BUGCROWD_API_USERNAME=<API key>
BUGCROWD_API_PASSWORD=<API secret>
```

To automatically authorize ChatGPT with those server-side credentials instead of displaying the connect form, additionally set:

```text
BUGCROWD_OAUTH_AUTO_AUTHORIZE=1
```

Do not commit API credentials to Git.

## Local development

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000/api/health
```

## Security model

- Bugcrowd API credentials are never committed to the repository.
- The ChatGPT OAuth bridge uses PKCE S256.
- OAuth authorization codes are short-lived and single-use.
- Access and refresh tokens are opaque random values.
- Refresh tokens rotate on use.
- Bugcrowd credentials stay server-side in Vercel Runtime Cache for the active grant.
- Access tokens are bound to this MCP resource and the ChatGPT OAuth client.
- The API escape-hatch tool rejects absolute URLs and traversal paths.
- MCP discovery remains available before authentication; authenticated tool execution fails closed and emits an MCP OAuth challenge.

## Previous implementation

The original repository was a Python FastMCP/stdin prototype pinned to the dated `2025-04-23` API version. Version 2.0 replaces that implementation with the remote/Vercel architecture above.

## License

MIT
