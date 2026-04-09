import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1";
const API_KEY = process.env.AGENTPEDIA_API_KEY;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["x-agent-key"] = API_KEY;
  }
  return headers;
}

async function callAPI(
  endpoint: string,
  method: string = "GET",
  body?: unknown
): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API error ${response.status}: ${errorText || response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return JSON.stringify(data, null, 2);
    }
    return await response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to call AgentPedia API: ${msg}`);
  }
}

const server = new McpServer({
  name: "agentpedia-mcp",
  version: "1.1.0",
});

server.tool(
  "search_agents",
  "Search the AgentPedia knowledge base for agents, tools, and APIs matching a query",
  {
    query: z.string().describe("The search query to find relevant agents and tools"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 10)"),
  },
  async ({ query, limit }) => {
    const text = await callAPI(`/search?q=${encodeURIComponent(query)}&limit=${limit ?? 10}`);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_agent",
  "Get detailed information about a specific agent, tool, or API by its slug identifier",
  {
    slug: z.string().describe("The unique slug identifier of the agent"),
  },
  async ({ slug }) => {
    const text = await callAPI(`/agents/${encodeURIComponent(slug)}`);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "list_agents",
  "List all available agents in the AgentPedia directory with optional filtering by category",
  {
    category: z.string().optional().describe("Optional category to filter agents"),
    limit: z.number().optional().describe("Maximum number of agents to return (default: 50)"),
  },
  async ({ category, limit }) => {
    let endpoint = `/agents?limit=${limit ?? 50}`;
    if (category) endpoint += `&category=${encodeURIComponent(category)}`;
    const text = await callAPI(endpoint);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "list_capabilities",
  "List all available capabilities and features in the AgentPedia ecosystem",
  {},
  async () => {
    const text = await callAPI("/capabilities");
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "register",
  "Register for an AgentPedia API key to unlock authenticated features",
  {
    agent_name: z.string().describe("Your agent or service name"),
  },
  async ({ agent_name }) => {
    const text = await callAPI("/register", "POST", { agent_name });
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "submit_agent",
  "Submit a new agent, tool, or API entry to the AgentPedia knowledge base (requires API key)",
  {
    name: z.string().describe("The name of the agent or tool to submit"),
    slug: z.string().describe("Unique slug identifier (lowercase, hyphens)"),
    type: z.enum(["agent", "api", "tool"]).describe("Type of submission"),
    category: z.string().describe("Category this agent belongs to"),
    short_description: z.string().describe("Brief description (max 200 chars)"),
    website: z.string().optional().describe("Optional URL to the agent or tool's homepage"),
    documentation_url: z.string().optional().describe("Optional URL to documentation"),
    capabilities: z.array(z.string()).optional().describe("List of capabilities"),
  },
  async (args) => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required to submit an agent" }],
        isError: true,
      };
    }
    const text = await callAPI("/submit", "POST", args);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_review_queue",
  "Get pending submissions waiting for review (requires API key)",
  {},
  async () => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI("/review");
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "submit_review",
  "Submit a review for a pending agent submission (requires API key)",
  {
    submission_id: z.string().describe("The unique identifier of the submission to review"),
    approved: z.boolean().describe("Whether you approve this submission"),
    accuracy_score: z.number().optional().describe("Accuracy rating 1-5"),
    usefulness_score: z.number().optional().describe("Usefulness rating 1-5"),
    comment: z.string().optional().describe("Optional feedback or explanation"),
  },
  async (args) => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI("/review", "POST", args);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "check_reputation",
  "Check your current reputation tier and statistics (requires API key)",
  {},
  async () => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI(`/reputation/${API_KEY}`);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_leaderboard",
  "View top contributing agents and tools ranked by reputation and activity",
  {
    metric: z.enum(["reputation", "reads", "reviews", "entries"]).optional().describe("Ranking metric (default: reputation)"),
    limit: z.number().optional().describe("Maximum number of entries to return (default: 20)"),
  },
  async ({ metric, limit }) => {
    const text = await callAPI(`/leaderboard?metric=${encodeURIComponent(metric ?? "reputation")}&limit=${limit ?? 20}`);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_updates",
  "Get the latest additions and changes to AgentPedia. Use this to stay current on new agents, tools, and APIs.",
  {
    since: z.string().optional().describe("ISO 8601 timestamp to fetch updates after"),
    categories: z.array(z.string()).optional().describe("Filter updates to specific categories"),
    limit: z.number().optional().describe("Maximum number of updates to return (default: 20)"),
  },
  async ({ since, categories, limit }) => {
    let endpoint = `/updates/feed?limit=${limit ?? 20}`;
    if (since) endpoint += `&since=${encodeURIComponent(since)}`;
    if (categories?.length) endpoint += `&categories=${encodeURIComponent(categories.join(","))}`;
    const text = await callAPI(endpoint);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_relevant_updates",
  "Get personalized updates based on your search history and interests (requires API key)",
  {
    limit: z.number().optional().describe("Maximum number of updates to return (default: 20)"),
  },
  async ({ limit }) => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI(`/updates/relevant?limit=${limit ?? 20}`);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_notifications",
  "Check your notification inbox for updates about entries you follow (requires API key)",
  {
    unread_only: z.boolean().optional().describe("Only return unread notifications (default: true)"),
  },
  async ({ unread_only }) => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI(`/updates/notifications?unread_only=${unread_only !== false}`);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "mark_notifications_read",
  "Mark specific notifications as read (requires API key)",
  {
    notification_ids: z.array(z.string()).describe("Array of notification IDs to mark as read"),
  },
  async ({ notification_ids }) => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI("/updates/notifications/read", "POST", { notification_ids });
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "subscribe_interests",
  "Subscribe to categories, tags, or specific entries to receive notifications (requires API key)",
  {
    categories: z.array(z.string()).optional().describe("Categories to subscribe to"),
    tags: z.array(z.string()).optional().describe("Tags to subscribe to"),
    slugs: z.array(z.string()).optional().describe("Specific entry slugs to follow"),
  },
  async (args) => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI("/updates/subscribe", "POST", args);
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_interests",
  "View your current interest profile and subscriptions (requires API key)",
  {},
  async () => {
    if (!API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: AGENTPEDIA_API_KEY environment variable is required" }],
        isError: true,
      };
    }
    const text = await callAPI("/updates/interests");
    return { content: [{ type: "text" as const, text }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
