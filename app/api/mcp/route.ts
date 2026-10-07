import { createMcpHandler } from "mcp-handler";
import { registerBugcrowdResearcherTools } from "../../../src/tools";

const handler = createMcpHandler(
  (server) => {
    registerBugcrowdResearcherTools(server);
  },
  {
    serverInfo: {
      name: "bugcrowd-researcher-mcp",
      version: "2.1.0",
    },
  }
);

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 60;

export { handler as GET, handler as POST, handler as DELETE };
