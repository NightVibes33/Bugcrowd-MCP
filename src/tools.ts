import { z } from "zod";
import {
  bugcrowdApiRequest,
  createSubmission,
  getEngagement,
  getProgram,
  getPublicEngagement,
  getSubmission,
  getSubmissionWithConversation,
  listEngagements,
  listMonetaryRewards,
  listPayments,
  listPrograms,
  listSubmissions,
  listTargetGroups,
  listTargets,
  searchSubmissions,
  updateSubmission,
} from "./bugcrowd-client";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

type ErrorFormatter = (error: unknown) => ToolResult;

const defaultError: ErrorFormatter = (error) => ({
  content: [
    {
      type: "text" as const,
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true,
});

function jsonResult(value: unknown): ToolResult {
  const failed =
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    (value as { ok?: boolean }).ok === false;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
    ...(failed ? { isError: true } : {}),
  };
}

const querySchema = z
  .record(
    z.string(),
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ])
  )
  .optional()
  .describe(
    "Optional Bugcrowd query parameters. Use bracketed JSON:API keys such as filter[state], include, fields[submission], page[limit], or page[offset]."
  );

export function registerBugcrowdTools(
  server: any,
  formatError: ErrorFormatter = defaultError
) {
  const registerAuthenticated = (
    name: string,
    description: string,
    inputSchema: Record<string, z.ZodTypeAny>,
    handler: (params: any) => Promise<unknown>
  ) => {
    server.registerTool(
      name,
      {
        title: name
          .split("_")
          .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
        description,
        inputSchema: z.object(inputSchema),
        securitySchemes: [{ type: "oauth2", scopes: ["bugcrowd"] }],
        _meta: {
          // Back-compat mirror required by older ChatGPT/App SDK clients.
          securitySchemes: [{ type: "oauth2", scopes: ["bugcrowd"] }],
        },
        annotations: {
          readOnlyHint: !["create_submission", "update_submission", "bugcrowd_api_request"].includes(name),
          destructiveHint: name === "bugcrowd_api_request",
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (params: any) => {
        try {
          return jsonResult(await handler(params));
        } catch (error) {
          return formatError(error);
        }
      }
    );
  };

  server.registerTool(
    "get_researcher_login",
    {
      title: "Open Bugcrowd Researcher Login",
      description:
        "Return Bugcrowd's official researcher sign-in URL and the supported session model. This does not collect credentials, passwords, passkeys, 2FA codes, or Bugcrowd session cookies. Use this when a researcher wants to sign in to their real Bugcrowd account. Private researcher-account actions require an authenticated browser session; Bugcrowd does not expose a documented researcher OAuth handoff to this MCP.",
      inputSchema: z.object({}),
      securitySchemes: [{ type: "noauth" }],
      _meta: {
        securitySchemes: [{ type: "noauth" }],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () =>
      jsonResult({
        mode: "researcher_browser_session",
        login_url: "https://login.hackers.bugcrowd.com/",
        account_portal: "https://bugcrowd.com/",
        authentication: "Bugcrowd web login with the account's configured MFA/2FA",
        credentials_collected_by_mcp: false,
        session_cookie_shared_with_mcp: false,
        private_account_access:
          "Use an authenticated browser session (for example ChatGPT Work browser control) and complete Bugcrowd login/2FA directly on Bugcrowd. The MCP cannot legitimately receive or replay the Bugcrowd researcher web session because Bugcrowd does not expose a documented researcher OAuth callback.",
        api_note:
          "Bugcrowd API tools are separate and require Bugcrowd API credentials on accounts where Bugcrowd exposes API Credentials.",
      })
  );

  server.registerTool(
    "get_public_engagement",
    {
      title: "Get Public Engagement",
      description:
        "Fetch a public Bugcrowd engagement page by slug without account authentication. Use this first for public bounty policy/scope context such as slug 'openai'.",
      inputSchema: z.object({
        slug: z
          .string()
          .min(1)
          .describe(
            "Public Bugcrowd engagement slug from /engagements/<slug>, for example openai."
          ),
      }),
      securitySchemes: [{ type: "noauth" }],
      _meta: {
        // Back-compat mirror required by older ChatGPT/App SDK clients.
        securitySchemes: [{ type: "noauth" }],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ slug }: { slug: string }) => {
      try {
        return jsonResult(await getPublicEngagement(slug));
      } catch (error) {
        return defaultError(error);
      }
    }
  );

  registerAuthenticated(
    "list_programs",
    "API-only: list Bugcrowd programs available to Bugcrowd API credentials. Standard researcher accounts may not expose API Credentials; for public researcher program data use get_public_engagement instead.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listPrograms(limit ?? 25, offset ?? 0, query)
  );

  registerAuthenticated(
    "get_program",
    "API-only: get one Bugcrowd program by API resource ID. Requires an account where Bugcrowd exposes API Credentials.",
    {
      program_id: z.string().min(1),
      query: querySchema,
    },
    ({ program_id, query }) => getProgram(program_id, query)
  );

  registerAuthenticated(
    "list_engagements",
    "API-only: list engagements visible to Bugcrowd API credentials. This is not a researcher web-session endpoint.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listEngagements(limit ?? 25, offset ?? 0, query)
  );

  registerAuthenticated(
    "get_engagement",
    "Get one Bugcrowd engagement by API resource ID.",
    {
      engagement_id: z.string().min(1),
      query: querySchema,
    },
    ({ engagement_id, query }) => getEngagement(engagement_id, query)
  );

  registerAuthenticated(
    "list_targets",
    "List Bugcrowd targets/assets visible to the connected API credentials. Use filters to narrow to the intended engagement or target group before testing or reporting.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listTargets(limit ?? 50, offset ?? 0, query)
  );

  registerAuthenticated(
    "list_target_groups",
    "List Bugcrowd target groups visible to the connected API credentials.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listTargetGroups(limit ?? 50, offset ?? 0, query)
  );

  registerAuthenticated(
    "list_submissions",
    "API-only: list submissions visible to Bugcrowd API credentials. Standard researcher web sessions are not accepted by this MCP.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listSubmissions(limit ?? 25, offset ?? 0, query)
  );

  registerAuthenticated(
    "search_submissions",
    "Use Bugcrowd API v1.1.0 POST /submissions/search. Pass the documented request payload unchanged so advanced server-side search/filter semantics are preserved.",
    {
      payload: z.any().describe(
        "Complete request body documented for POST /submissions/search."
      ),
    },
    ({ payload }) => searchSubmissions(payload)
  );

  registerAuthenticated(
    "get_submission",
    "Get one Bugcrowd submission by API resource ID.",
    {
      submission_id: z.string().min(1),
      query: querySchema,
    },
    ({ submission_id, query }) => getSubmission(submission_id, query)
  );

  registerAuthenticated(
    "get_submission_with_conversation",
    "API-only: get a submission plus activities and comments using Bugcrowd API credentials. For a researcher account without API access, use the authenticated Bugcrowd website in a browser session.",
    {
      submission_id: z.string().min(1),
    },
    ({ submission_id }) => getSubmissionWithConversation(submission_id)
  );

  registerAuthenticated(
    "create_submission",
    "API-only: create a submission using the official Bugcrowd API when the connected API credentials have permission. This does not substitute for the researcher website and does not accept researcher session cookies.",
    {
      payload: z.any().describe(
        "Complete Bugcrowd JSON:API request body for POST /submissions."
      ),
    },
    ({ payload }) => createSubmission(payload)
  );

  registerAuthenticated(
    "update_submission",
    "Update a Bugcrowd submission using the official API when the connected credentials and submission state allow it.",
    {
      submission_id: z.string().min(1),
      payload: z.any().describe(
        "Complete Bugcrowd JSON:API request body for PATCH /submissions/{id}."
      ),
    },
    ({ submission_id, payload }) =>
      updateSubmission(submission_id, payload)
  );

  registerAuthenticated(
    "list_monetary_rewards",
    "List Bugcrowd monetary rewards. Bugcrowd v1.1.0 can include funding-pool relationships when requested by the API.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listMonetaryRewards(limit ?? 25, offset ?? 0, query)
  );

  registerAuthenticated(
    "list_payments",
    "List Bugcrowd payments visible to the connected API credentials.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      query: querySchema,
    },
    ({ limit, offset, query }) =>
      listPayments(limit ?? 25, offset ?? 0, query)
  );

  registerAuthenticated(
    "bugcrowd_api_request",
    "Full-fidelity escape hatch for current documented Bugcrowd REST API operations that do not yet have a curated tool. Requires a relative api.bugcrowd.com path and never accepts an arbitrary host.",
    {
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .optional()
        .default("GET"),
      path: z
        .string()
        .min(1)
        .describe(
          "Relative Bugcrowd API path beginning with /, e.g. /submissions/search."
        ),
      query: querySchema,
      body: z.any().optional(),
      version: z
        .string()
        .optional()
        .describe(
          "Optional Bugcrowd-Version header. Omit for the current V1 contract unless a pinned version is specifically required."
        ),
    },
    ({ method, path, query, body, version }) =>
      bugcrowdApiRequest({ method, path, query, body, version })
  );
}
