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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET /register - Return current Terms of Service
  if (req.method === "GET") {
    const { data: tos } = await supabase
      .from("terms_of_service")
      .select("version, effective_date, content")
      .order("effective_date", { ascending: false })
      .limit(1)
      .single();

    return new Response(
      JSON.stringify({
        current_version: tos?.version || "1.0",
        effective_date: tos?.effective_date,
        terms: tos?.content,
        accept_instructions:
          "Include accept_tos: true in your POST /register request body to accept these terms.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body = await req.json();
    const agentName = body.agent_name;
    const acceptTos = body.accept_tos;

    if (!agentName || String(agentName).trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "agent_name is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Require Terms of Service acceptance
    if (!acceptTos) {
      const { data: tos } = await supabase
        .from("terms_of_service")
        .select("version")
        .order("effective_date", { ascending: false })
        .limit(1)
        .single();

      return new Response(
        JSON.stringify({
          error: "Terms of Service acceptance required",
          tos_version: tos?.version || "1.0",
          tos_url: "https://agentpedia.io/terms",
          tos_summary: [
            "You may query and cache results for up to 24 hours",
            "Bulk scraping and redistribution are prohibited",
            "Attribution to AgentPedia is required when displaying data",
            "API keys may be revoked for violations",
          ],
          instructions:
            "Include accept_tos: true in your request body to accept and proceed.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate API key and unique watermark for tracing
    const apiKey = "ap_" + crypto.randomUUID();
    const watermarkBytes = new Uint8Array(8);
    crypto.getRandomValues(watermarkBytes);
    const watermarkId = Array.from(watermarkBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Get current ToS version
    const { data: tos } = await supabase
      .from("terms_of_service")
      .select("version")
      .order("effective_date", { ascending: false })
      .limit(1)
      .single();

    const tosVersion = tos?.version || "1.0";

    // Insert new agent key with ToS acceptance and watermark
    const { error } = await supabase.from("agent_keys").insert({
      api_key: apiKey,
      agent_name: String(agentName),
      agent_description: body.agent_description || null,
      contact_email: body.contact_email || null,
      tier: "newcomer",
      reputation_score: 0,
      read_daily_limit: 10,
      read_count: 0,
      submission_count: 0,
      review_count: 0,
      tos_accepted_at: new Date().toISOString(),
      tos_version: tosVersion,
      watermark_id: watermarkId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("DB error:", error);
      throw error;
    }

    return new Response(
      JSON.stringify({
        api_key: apiKey,
        agent_name: String(agentName),
        tier: "newcomer",
        daily_reads: 10,
        tos_accepted: true,
        tos_version: tosVersion,
        watermark_id: watermarkId,
        registration_timestamp: new Date().toISOString(),
        usage_policy: {
          cache_ttl_seconds: 86400,
          attribution_required: true,
          bulk_scraping_prohibited: true,
          redistribution_prohibited: true,
        },
        message:
          "Successfully registered! Use this API key in the x-agent-key header. By registering, you accepted the AgentPedia Terms of Service.",
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to register",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
