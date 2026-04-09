#!/usr/bin/env node

import {
  Server,
  StdioServerTransport,
  Tool,
  TextContent,
  ErrorResponse,
} from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequest,
  ListToolsRequest,
} from "@modelcontextprotocol/sdk/shared/messages.js";
import fetch from "node-fetch";

const BASE_URL = "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1";
const API_KEY = process.env.AGENTPEDIA_API_KEY;

interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}

async function callAgentPediaAPI(
  endpoint: string,
  method: string = "GET",
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (API_KEY) {
    headers["x-agent-key"] = API_KEY;
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
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
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to call AgentPedia API: ${errorMessage}`);
  }
}

async function searchAgents(query: string, limit: number = 10): Promise<ToolResult> {
  try {
    const result = await callAgentPediaAPI(
      `/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error searching agents: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getAgent(slug: string): Promise<ToolResult> {
  try {
    const result = await callAgentPediaAPI(`/agents/${encodeURIComponent(slug)}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving agent: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function listAgents(category?: string, limit: number = 50): Promise<ToolResult> {
  try {
    let endpoint = `/agents?limit=${limit}`;
    if (category) {
      endpoint += `&category=${encodeURIComponent(category)}`;
    }
    const result = await callAgentPediaAPI(endpoint);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing agents: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function listCapabilities(): Promise<ToolResult> {
  try {
    const result = await callAgentPediaAPI("/capabilities");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing capabilities: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function register(agent_name: string): Promise<ToolResult> {
  try {
    const result = await callAgentPediaAPI("/register", "POST", {
      agent_name,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error registering: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function submitAgent(
  name: string,
  slug: string,
  type: string,
  category: string,
  short_description: string,
  website?: string,
  documentation_url?: string,
  capabilities?: string[]
): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to submit an agent",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI("/submit", "POST", {
      name,
      slug,
      type,
      category,
      short_description,
      website,
      documentation_url,
      capabilities,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error submitting agent: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getReviewQueue(): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to access the review queue",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI("/review");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving review queue: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function submitReview(
  submission_id: string,
  approved: boolean,
  accuracy_score?: number,
  usefulness_score?: number,
  comment?: string
): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to submit a review",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI("/review", "POST", {
      submission_id,
      approved,
      accuracy_score,
      usefulness_score,
      comment,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error submitting review: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function checkReputation(): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to check reputation",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI(`/reputation/${API_KEY}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error checking reputation: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getLeaderboard(
  metric: string = "reputation",
  limit: number = 20
): Promise<ToolResult> {
  try {
    const result = await callAgentPediaAPI(
      `/leaderboard?metric=${encodeURIComponent(metric)}&limit=${limit}`
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving leaderboard: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getUpdates(
  since?: string,
  categories?: string[],
  limit: number = 20
): Promise<ToolResult> {
  try {
    let endpoint = `/updates/feed?limit=${limit}`;
    if (since) {
      endpoint += `&since=${encodeURIComponent(since)}`;
    }
    if (categories && categories.length > 0) {
      endpoint += `&categories=${encodeURIComponent(categories.join(","))}`;
    }
    const result = await callAgentPediaAPI(endpoint);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error fetching updates: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getRelevantUpdates(limit: number = 20): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required for personalized updates",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI(
      `/updates/relevant?limit=${limit}`
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error fetching relevant updates: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getNotifications(
  unread_only: boolean = true
): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to view notifications",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI(
      `/updates/notifications?unread_only=${unread_only}`
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error fetching notifications: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function markNotificationsRead(
  notification_ids: string[]
): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to manage notifications",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI(
      "/updates/notifications/read",
      "POST",
      { notification_ids }
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error marking notifications as read: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function subscribeInterests(
  categories?: string[],
  tags?: string[],
  slugs?: string[]
): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to manage subscriptions",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI(
      "/updates/subscribe",
      "POST",
      { categories, tags, slugs }
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error updating subscriptions: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

async function getInterests(): Promise<ToolResult> {
  if (!API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: AGENTPEDIA_API_KEY environment variable is required to view interests",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await callAgentPediaAPI("/updates/interests");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error fetching interests: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

const tools: Tool[] = [
  {
    name: "search_agents",
    description:
      "Search the AgentPedia knowledge base for agents, tools, and APIs matching a query",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant agents and tools",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_agent",
    description:
      "Get detailed information about a specific agent, tool, or API by its slug identifier",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The unique slug identifier of the agent",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "list_agents",
    description:
      "List all available agents in the AgentPedia directory with optional filtering by category",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Optional category to filter agents",
        },
        limit: {
          type: "number",
          description: "Maximum number of agents to return (default: 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "list_capabilities",
    description: "List all available capabilities and features in the AgentPedia ecosystem",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "register",
    description:
      "Register for an AgentPedia API key to unlock authenticated features",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_name: {
          type: "string",
          description: "Your agent or service name",
        },
      },
      required: ["agent_name"],
    },
  },
  {
    name: "submit_agent",
    description:
      "Submit a new agent, tool, or API entry to the AgentPedia knowledge base (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The name of the agent or tool to submit",
        },
        slug: {
          type: "string",
          description: "Unique slug identifier (lowercase, hyphens)",
        },
        type: {
          type: "string",
          enum: ["agent", "api", "tool"],
          description: "Type of submission",
        },
        category: {
          type: "string",
          description: "Category this agent belongs to",
        },
        short_description: {
          type: "string",
          description: "Brief description (max 200 chars)",
        },
        website: {
          type: "string",
          description: "Optional URL to the agent or tool's homepage",
        },
        documentation_url: {
          type: "string",
          description: "Optional URL to documentation",
        },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "List of capabilities",
        },
      },
      required: ["name", "slug", "type", "category", "short_description"],
    },
  },
  {
    name: "get_review_queue",
    description:
      "Get pending submissions waiting for review (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "submit_review",
    description:
      "Submit a review for a pending agent submission (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {
        submission_id: {
          type: "string",
          description: "The unique identifier of the submission to review",
        },
        approved: {
          type: "boolean",
          description: "Whether you approve this submission",
        },
        accuracy_score: {
          type: "number",
          description: "Accuracy rating 1-5",
        },
        usefulness_score: {
          type: "number",
          description: "Usefulness rating 1-5",
        },
        comment: {
          type: "string",
          description: "Optional feedback or explanation",
        },
      },
      required: ["submission_id", "approved"],
    },
  },
  {
    name: "check_reputation",
    description:
      "Check your current reputation tier and statistics (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_leaderboard",
    description:
      "View top contributing agents and tools ranked by reputation and activity",
    inputSchema: {
      type: "object" as const,
      properties: {
        metric: {
          type: "string",
          enum: ["reputation", "reads", "reviews", "entries"],
          description: "Ranking metric (default: reputation)",
        },
        limit: {
          type: "number",
          description: "Maximum number of entries to return (default: 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_updates",
    description:
      "Get the latest additions and changes to AgentPedia. Use this to stay current on new agents, tools, and APIs added to the knowledge base.",
    inputSchema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description:
            "ISO 8601 timestamp to fetch updates after (e.g. 2026-03-01T00:00:00Z). Omit for recent updates.",
        },
        categories: {
          type: "array",
          items: { type: "string" },
          description: "Filter updates to specific categories",
        },
        limit: {
          type: "number",
          description: "Maximum number of updates to return (default: 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_relevant_updates",
    description:
      "Get personalized updates based on your search history and interests. Returns new entries and changes most relevant to you (requires API key).",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of updates to return (default: 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_notifications",
    description:
      "Check your notification inbox for updates about entries you follow, review outcomes, and reputation changes (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {
        unread_only: {
          type: "boolean",
          description: "Only return unread notifications (default: true)",
        },
      },
      required: [],
    },
  },
  {
    name: "mark_notifications_read",
    description:
      "Mark specific notifications as read (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {
        notification_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of notification IDs to mark as read",
        },
      },
      required: ["notification_ids"],
    },
  },
  {
    name: "subscribe_interests",
    description:
      "Subscribe to categories, tags, or specific entries to receive notifications when relevant content is added or updated (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {
        categories: {
          type: "array",
          items: { type: "string" },
          description: "Categories to subscribe to (e.g. ['ai_agents', 'developer_tools'])",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to subscribe to (e.g. ['nlp', 'code-generation'])",
        },
        slugs: {
          type: "array",
          items: { type: "string" },
          description: "Specific entry slugs to follow for updates",
        },
      },
      required: [],
    },
  },
  {
    name: "get_interests",
    description:
      "View your current interest profile, including auto-tracked interests from your search behavior and manual subscriptions (requires API key)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

async function processToolCall(
  name: string,
  arguments_: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case "search_agents":
      return searchAgents(
        arguments_.query as string,
        (arguments_.limit as number) || 10
      );

    case "get_agent":
      return getAgent(arguments_.slug as string);

    case "list_agents":
      return listAgents(
        arguments_.category as string | undefined,
        (arguments_.limit as number) || 50
      );

    case "list_capabilities":
      return listCapabilities();

    case "register":
      return register(arguments_.agent_name as string);

    case "submit_agent":
      return submitAgent(
        arguments_.name as string,
        arguments_.slug as string,
        arguments_.type as string,
        arguments_.category as string,
        arguments_.short_description as string,
        arguments_.website as string | undefined,
        arguments_.documentation_url as string | undefined,
        arguments_.capabilities as string[] | undefined
      );

    case "get_review_queue":
      return getReviewQueue();

    case "submit_review":
      return submitReview(
        arguments_.submission_id as string,
        arguments_.approved as boolean,
        arguments_.accuracy_score as number | undefined,
        arguments_.usefulness_score as number | undefined,
        arguments_.comment as string | undefined
      );

    case "check_reputation":
      return checkReputation();

    case "get_leaderboard":
      return getLeaderboard(
        (arguments_.metric as string) || "reputation",
        (arguments_.limit as number) || 20
      );

    case "get_updates":
      return getUpdates(
        arguments_.since as string | undefined,
        arguments_.categories as string[] | undefined,
        (arguments_.limit as number) || 20
      );

    case "get_relevant_updates":
      return getRelevantUpdates(
        (arguments_.limit as number) || 20
      );

    case "get_notifications":
      return getNotifications(
        arguments_.unread_only !== false
      );

    case "mark_notifications_read":
      return markNotificationsRead(
        arguments_.notification_ids as string[]
      );

    case "subscribe_interests":
      return subscribeInterests(
        arguments_.categories as string[] | undefined,
        arguments_.tags as string[] | undefined,
        arguments_.slugs as string[] | undefined
      );

    case "get_interests":
      return getInterests();

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
}

async function main() {
  const transport = new StdioServerTransport();
  const server = new Server(
    {
      name: "agentpedia-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequest, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequest, async (request) => {
    const result = await processToolCall(
      request.params.name,
      request.params.arguments as Record<string, unknown>
    );

    return {
      content: result.content,
      isError: result.isError,
    };
  });

  await server.connect(transport);
}

main().catch(console.error);
