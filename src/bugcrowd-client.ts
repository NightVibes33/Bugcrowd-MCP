import { getBugcrowdCredentials } from "./request-auth";

const BUGCROWD_API_BASE = "https://api.bugcrowd.com";
export const BUGCROWD_API_VERSION = "v1.1.0";

export type BugcrowdApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryValue = string | number | boolean | Array<string | number | boolean>;

function getCredentials() {
  const requestCredentials = getBugcrowdCredentials();
  const username =
    requestCredentials?.username ?? process.env.BUGCROWD_API_USERNAME;
  const password =
    requestCredentials?.password ?? process.env.BUGCROWD_API_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Missing BUGCROWD_API_USERNAME or BUGCROWD_API_PASSWORD environment variables"
    );
  }
  return { username, password };
}

function authorizationHeader() {
  const { username, password } = getCredentials();
  return `Token ${username}:${password}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendQuery(url: URL, query?: Record<string, QueryValue>) {
  for (const [key, raw] of Object.entries(query ?? {})) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    }
  }
}

function safeHeaders(headers: Headers) {
  return {
    request_id:
      headers.get("x-request-id") ||
      headers.get("bugcrowd-request-id") ||
      headers.get("traceparent"),
    rate_limit: {
      limit:
        headers.get("x-ratelimit-limit") ||
        headers.get("ratelimit-limit"),
      remaining:
        headers.get("x-ratelimit-remaining") ||
        headers.get("ratelimit-remaining"),
      reset:
        headers.get("x-ratelimit-reset") ||
        headers.get("ratelimit-reset"),
      retry_after: headers.get("retry-after"),
    },
  };
}

async function parseResponse(response: Response) {
  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (
    contentType.includes("json") ||
    contentType.endsWith("+json") ||
    contentType === ""
  ) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (contentType.startsWith("text/")) {
    return response.text();
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    content_type: contentType || "application/octet-stream",
    base64_data: bytes.toString("base64"),
  };
}

export async function bugcrowdApiRequest(opts: {
  method?: BugcrowdApiMethod;
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  version?: string;
}) {
  const method = opts.method ?? "GET";

  if (
    !opts.path.startsWith("/") ||
    opts.path.includes("://") ||
    opts.path.includes("..")
  ) {
    throw new Error(
      "path must be a relative Bugcrowd API path beginning with /"
    );
  }

  const url = new URL(`${BUGCROWD_API_BASE}${opts.path}`);
  appendQuery(url, opts.query);

  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: authorizationHeader(),
          Accept: "application/vnd.bugcrowd+json",
          ...(opts.body !== undefined
            ? { "Content-Type": "application/vnd.bugcrowd+json" }
            : {}),
          ...(opts.version ? { "Bugcrowd-Version": opts.version } : {}),
          "User-Agent": "bugcrowd-mcp-server/2.0",
        },
        ...(opts.body !== undefined
          ? { body: JSON.stringify(opts.body) }
          : {}),
        cache: "no-store",
      });

      const metadata = safeHeaders(response.headers);

      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(metadata.rate_limit.retry_after);
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1000 * Math.pow(2, attempt + 1)
        );
        continue;
      }

      const payload = await parseResponse(response);

      if (!response.ok) {
        return {
          ok: false as const,
          status: response.status,
          error: payload,
          ...metadata,
          api_version: BUGCROWD_API_VERSION,
        };
      }

      return {
        ok: true as const,
        status: response.status,
        data: payload,
        ...metadata,
        api_version: BUGCROWD_API_VERSION,
      };
    } catch (error) {
      lastNetworkError = error;
      if (attempt < 2) {
        await sleep(1000 * Math.pow(2, attempt + 1));
        continue;
      }
    }
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("Bugcrowd API request failed after retries");
}

function queryWithPage(
  limit = 25,
  offset = 0,
  extra?: Record<string, QueryValue>
) {
  return {
    "page[limit]": Math.max(1, Math.min(limit, 100)),
    "page[offset]": Math.max(0, offset),
    ...(extra ?? {}),
  };
}

export async function listPrograms(
  limit = 25,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/programs",
    query: queryWithPage(limit, offset, query),
  });
}

export async function getProgram(
  id: string,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: `/programs/${encodeURIComponent(id)}`,
    query,
  });
}

export async function listEngagements(
  limit = 25,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/engagements",
    query: queryWithPage(limit, offset, query),
  });
}

export async function getEngagement(
  id: string,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: `/engagements/${encodeURIComponent(id)}`,
    query,
  });
}

export async function listTargets(
  limit = 50,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/targets",
    query: queryWithPage(limit, offset, query),
  });
}

export async function listTargetGroups(
  limit = 50,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/target_groups",
    query: queryWithPage(limit, offset, query),
  });
}

export async function listSubmissions(
  limit = 25,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/submissions",
    query: queryWithPage(limit, offset, query),
  });
}

export async function searchSubmissions(payload: unknown) {
  return bugcrowdApiRequest({
    method: "POST",
    path: "/submissions/search",
    body: payload,
  });
}

export async function getSubmission(
  id: string,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: `/submissions/${encodeURIComponent(id)}`,
    query,
  });
}

export async function getSubmissionWithConversation(id: string) {
  const encoded = encodeURIComponent(id);
  const [submission, activities, comments] = await Promise.all([
    bugcrowdApiRequest({ path: `/submissions/${encoded}` }),
    bugcrowdApiRequest({
      path: `/submissions/${encoded}/activities`,
      query: { "page[limit]": 100 },
    }),
    bugcrowdApiRequest({
      path: `/submissions/${encoded}/comments`,
      query: { "page[limit]": 100 },
    }),
  ]);

  return { submission, activities, comments };
}

export async function createSubmission(payload: unknown) {
  return bugcrowdApiRequest({
    method: "POST",
    path: "/submissions",
    body: payload,
  });
}

export async function updateSubmission(id: string, payload: unknown) {
  return bugcrowdApiRequest({
    method: "PATCH",
    path: `/submissions/${encodeURIComponent(id)}`,
    body: payload,
  });
}

export async function listMonetaryRewards(
  limit = 25,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/monetary_rewards",
    query: queryWithPage(limit, offset, query),
  });
}

export async function listPayments(
  limit = 25,
  offset = 0,
  query?: Record<string, QueryValue>
) {
  return bugcrowdApiRequest({
    path: "/payments",
    query: queryWithPage(limit, offset, query),
  });
}

function decodeEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function visibleText(html: string) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

export async function getPublicEngagement(slug: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
    throw new Error("engagement slug contains unsupported characters");
  }

  const url = `https://bugcrowd.com/engagements/${encodeURIComponent(slug)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; BugcrowdMCP/2.0; +https://bugcrowd.com)",
    },
    redirect: "follow",
    cache: "no-store",
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(
      `Bugcrowd public engagement page returned HTTP ${response.status}`
    );
  }

  return {
    slug,
    url: response.url,
    status: response.status,
    text: visibleText(html).slice(0, 120_000),
    html: html.slice(0, 350_000),
    truncated: html.length > 350_000,
  };
}
