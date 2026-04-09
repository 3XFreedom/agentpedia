import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-agent-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

interface HealthCheckResult {
  agent_id: string;
  status: string;
  response_time_ms: number | null;
  http_status: number | null;
  error_message: string | null;
}

async function checkUrl(
  url: string,
  timeoutMs: number = 10000
): Promise<{
  status: string;
  response_time_ms: number;
  http_status: number | null;
  error: string | null;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const elapsed = Date.now() - start;

    if (resp.status >= 200 && resp.status < 400) {
      return {
        status: elapsed > 5000 ? "degraded" : "up",
        response_time_ms: elapsed,
        http_status: resp.status,
        error: null,
      };
    } else if (resp.status >= 500) {
      return {
        status: "down",
        response_time_ms: elapsed,
        http_status: resp.status,
        error: `HTTP ${resp.status}`,
      };
    } else {
      return {
        status: "degraded",
        response_time_ms: elapsed,
        http_status: resp.status,
        error: `HTTP ${resp.status}`,
      };
    }
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) {
      return {
        status: "timeout",
        response_time_ms: elapsed,
        http_status: null,
        error: "Request timed out after 10s",
      };
    }
    return {
      status: "down",
      response_time_ms: elapsed,
      http_status: null,
      error: msg,
    };
  }
}

async function runHealthChecks(
  batchSize: number = 20
): Promise<HealthCheckResult[]> {
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, slug, health_check_url")
    .not("health_check_url", "is", null)
    .order("updated_at", { ascending: true })
    .limit(batchSize);

  if (error || !agents) {
    throw new Error(`Failed to fetch agents: ${error?.message}`);
  }

  const results: HealthCheckResult[] = [];

  // Run checks in parallel batches of 5
  for (let i = 0; i < agents.length; i += 5) {
    const batch = agents.slice(i, i + 5);
    const checks = await Promise.all(
      batch.map(async (agent: { id: string; slug: string; health_check_url: string }) => {
        const result = await checkUrl(agent.health_check_url);
        return { agent_id: agent.id, slug: agent.slug, ...result };
      })
    );

    for (const check of checks) {
      await supabase.from("health_checks").insert({
        agent_id: check.agent_id,
        status: check.status,
        response_time_ms: check.response_time_ms,
        http_status: check.http_status,
        error_message: check.error,
        check_type: "http",
      });

      const { data: existing } = await supabase
        .from("agent_health_status")
        .select("consecutive_failures, total_checks")
        .eq("agent_id", check.agent_id)
        .single();

      const consecutiveFailures =
        check.status === "up" || check.status === "degraded"
          ? 0
          : (existing?.consecutive_failures || 0) + 1;

      await supabase.from("agent_health_status").upsert({
        agent_id: check.agent_id,
        current_status: check.status,
        last_checked_at: new Date().toISOString(),
        ...(check.status === "up" || check.status === "degraded"
          ? { last_up_at: new Date().toISOString() }
          : { last_down_at: new Date().toISOString() }),
        avg_response_time_ms: check.response_time_ms,
        consecutive_failures: consecutiveFailures,
        total_checks: (existing?.total_checks || 0) + 1,
        updated_at: new Date().toISOString(),
      });

      await supabase
        .from("agents")
        .update({ last_known_status: check.status })
        .eq("id", check.agent_id);

      results.push({
        agent_id: check.agent_id,
        status: check.status,
        response_time_ms: check.response_time_ms,
        http_status: check.http_status,
        error_message: check.error,
      });
    }
  }

  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path =
    url.pathname.replace(/^\/health\/?/, "/").replace(/\/+$/, "") || "/";

  try {
    // GET /health/status - Get health status for all agents
    if (req.method === "GET" && (path === "/status" || path === "/")) {
      const slug = url.searchParams.get("slug");
      const statusFilter = url.searchParams.get("status");
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "50"),
        100
      );

      if (slug) {
        const { data: agent } = await supabase
          .from("agents")
          .select("id")
          .eq("slug", slug)
          .single();

        if (!agent) {
          return new Response(
            JSON.stringify({ error: "Agent not found" }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const { data: health } = await supabase
          .from("agent_health_status")
          .select("*")
          .eq("agent_id", agent.id)
          .single();

        const { data: history } = await supabase
          .from("health_checks")
          .select(
            "status, response_time_ms, http_status, checked_at, error_message"
          )
          .eq("agent_id", agent.id)
          .order("checked_at", { ascending: false })
          .limit(20);

        return new Response(
          JSON.stringify({
            slug,
            health: health || { current_status: "unknown" },
            recent_checks: history || [],
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      let query = supabase
        .from("agent_health_status")
        .select(
          "agent_id, current_status, last_checked_at, last_up_at, avg_response_time_ms, uptime_percent_7d, consecutive_failures, total_checks"
        )
        .order("last_checked_at", { ascending: false })
        .limit(limit);

      if (statusFilter) {
        query = query.eq("current_status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ data, count: data?.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /health/summary - Aggregate health overview
    if (req.method === "GET" && path === "/summary") {
      const { data, error } = await supabase
        .from("agent_health_status")
        .select("current_status");

      if (error) throw error;

      const summary = {
        total: data?.length || 0,
        up: data?.filter((h: { current_status: string }) => h.current_status === "up").length || 0,
        down: data?.filter((h: { current_status: string }) => h.current_status === "down").length || 0,
        degraded: data?.filter((h: { current_status: string }) => h.current_status === "degraded").length || 0,
        timeout: data?.filter((h: { current_status: string }) => h.current_status === "timeout").length || 0,
        unknown: data?.filter((h: { current_status: string }) => h.current_status === "unknown").length || 0,
        checked_at: new Date().toISOString(),
      };

      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /health/run - Trigger a batch of health checks
    if (req.method === "POST" && path === "/run") {
      const batchSize = parseInt(
        url.searchParams.get("batch") || "20"
      );
      const results = await runHealthChecks(Math.min(batchSize, 50));

      const up = results.filter((r) => r.status === "up").length;
      const down = results.filter(
        (r) => r.status === "down" || r.status === "timeout"
      ).length;
      const degraded = results.filter(
        (r) => r.status === "degraded"
      ).length;

      return new Response(
        JSON.stringify({ checked: results.length, up, down, degraded, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Not found",
        endpoints: [
          "GET /health/status - Health status (params: slug, status, limit)",
          "GET /health/summary - Aggregate overview",
          "POST /health/run - Trigger check batch (params: batch)",
        ],
      }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
