export const runtime = "nodejs";
export const preferredRegion = "iad1";

export function GET() {
  return Response.json({
    ok: true,
    service: "bugcrowd-mcp-server",
    version: "2.0.0",
    bugcrowd_api: {
      version: "v1.1.0",
      reviewed_through: "2026-10-07",
      media_type: "application/vnd.bugcrowd+json",
    },
    deployment: {
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    },
    transport: "/api/mcp",
    oauth: {
      enabled: true,
      storage: "vercel-runtime-cache",
      region: "iad1",
      protected_resource_metadata: "/.well-known/oauth-protected-resource",
      authorization_server_metadata:
        "/.well-known/oauth-authorization-server",
    },
  });
}
