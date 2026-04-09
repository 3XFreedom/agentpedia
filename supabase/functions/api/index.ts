import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  verifyApiKey,
  incrementReadCount,
  checkReadLimit,
} from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface Agent {
  id: string;
  slug: string;
  name: string;
  type: string;
  category: string;
  short_description: string;
  long_description?: string;
  website?: string;
  capabilities: string[];
  auth_type?: string;
  api_endpoint?: string;
  rating: number;
  reputation_score: number;
  published_at: string;
}

interface SearchResult {
  data: Agent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  meta: {
    timestamp: string;
    request_id: string;
    cache_ttl_seconds: number;
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const apiKey = req.headers.get("x-agent-key");
  const path = url.pathname;

  try {
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle GET /agents
    if (path === "/api/agents" && req.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "50"),
        100
      );
      const category = url.searchParams.get("category");
      const capability = url.searchParams.get("capability");

      let query = supabase
        .from("agents")
        .select("*", { count: "exact" })
        .eq("status", "published")
        .range((page - 1) * limit, page * limit - 1);

      if (category) {
        query = query.contains("categories", [category]);
      }
      if (capability) {
        query = query.contains("capabilities", [capability]);
      }

      const { data, count, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({
          data: data || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            total_pages: Math.ceil((count || 0) / limit),
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: crypto.randomUUID(),
            cache_ttl_seconds: 300,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle GET /agents/:slug
    if (
      path.match(/^\/api\/agents\/[a-z0-9-]+$/) &&
      req.method === "GET"
    ) {
      const slug = path.split("/").pop();

      if (apiKey) {
        const { isValid } = await verifyApiKey(apiKey, supabase);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error: "Invalid API key" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const canRead = await checkReadLimit(apiKey, supabase);
        if (!canRead) {
          return new Response(
            JSON.stringify({
              error: "Daily read limit exceeded. Upgrade your tier or check back tomorrow.",
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await incrementReadCount(apiKey, supabase);
      }

      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: "Agent not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle GET /search
    if (path === "/api/search" && req.method === "GET") {
      const q = url.searchParams.get("q");
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "20"),
        50
      );
      const type = url.searchParams.get("type");

      if (!q || q.length < 2) {
        return new Response(
          JSON.stringify({ error: "Query must be at least 2 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabase
        .from("agents")
        .select("*")
        .eq("status", "published")
        .or(
          `name.ilike.%${q}%,short_description.ilike.%${q}%,capabilities.cs.{${q}}`
        )
        .limit(limit);

      if (type) {
        query = query.eq("type", type);
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({
          data: data || [],
          meta: {
            timestamp: new Date().toISOString(),
            request_id: crypto.randomUUID(),
            cache_ttl_seconds: 300,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle GET /capabilities
    if (path === "/api/capabilities" && req.method === "GET") {
      const { data, error } = await supabase
        .from("agents")
        .select("capabilities")
        .eq("status", "published");

      if (error) throw error;

      const capabilityMap = new Map<string, number>();
      (data || []).forEach((agent: any) => {
        (agent.capabilities || []).forEach((cap: string) => {
          capabilityMap.set(cap, (capabilityMap.get(cap) || 0) + 1);
        });
      });

      const capabilities = Array.from(capabilityMap.entries())
        .map(([name, count]) => ({
          id: name.toLowerCase().replace(/\s+/g, "-"),
          name: name,
          description: `Capability: ${name}`,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      return new Response(JSON.stringify(capabilities), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle GET /leaderboard
    if (path === "/api/leaderboard" && req.method === "GET") {
      const metric = url.searchParams.get("metric") || "reputation";
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "20"),
        100
      );

      let orderBy = "reputation_score";
      if (metric === "reads") orderBy = "read_count";
      else if (metric === "reviews") orderBy = "review_count";
      else if (metric === "entries") orderBy = "submission_count";

      const { data, error } = await supabase
        .from("agent_keys")
        .select(
          "agent_name, reputation_score, read_count, review_count, submission_count, tier"
        )
        .order(orderBy, { ascending: false })
        .limit(limit);

      if (error) throw error;

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle GET /reputation/:api_key
    if (path.match(/^\/api\/reputation\/ap_/) && req.method === "GET") {
      const keyFromPath = path.split("/").pop();

      const { data, error } = await supabase
        .from("agent_keys")
        .select(
          "agent_name, tier, reputation_score, read_count, read_daily_limit, submission_count, review_count, created_at"
        )
        .eq("api_key", keyFromPath)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "API key not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
