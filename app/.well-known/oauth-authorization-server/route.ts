import { authorizationServerMetadata } from "../../../src/oauth";

export const runtime = "nodejs";

export function GET(request: Request) {
  return Response.json(
    authorizationServerMetadata(new URL(request.url).origin),
    {
      headers: { "cache-control": "public, max-age=300" },
    }
  );
}
