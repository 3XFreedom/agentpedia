import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyApiKey } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface FlagRequest {
  submission_id?: string;
  agent_slug?: string;
  flag_type: "spam" | "inaccurate" | "offensive" | "suspicious" | "duplicate";
  details: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const apiKey = req.headers.get("x-agent-key");

  // Verify API key for all operations
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "x-agent-key header is required" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const { isValid, tier } = await verifyApiKey(apiKey, supabase);
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired API key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Handle GET /moderate (get flags - moderators only)
  if (req.method === "GET") {
    if (!["moderator", "super_moderator"].includes(tier)) {
      return new Response(
        JSON.stringify({
          error: "Only moderators can view flags",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabase
      .from("agent_flags")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    return new Response(JSON.stringify(data || []), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle POST /moderate (flag content)
  if (req.method === "POST") {
    try {
      const body: FlagRequest = await req.json();

      if (!body.submission_id && !body.agent_slug) {
        return new Response(
          JSON.stringify({
            error:
              "Either submission_id or agent_slug is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!body.flag_type || !body.details) {
        return new Response(
          JSON.stringify({
            error: "flag_type and details are required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify content exists
      if (body.submission_id) {
        const { data: submission, error: subError } = await supabase
          .from("submissions")
          .select("id")
          .eq("id", body.submission_id)
          .single();

        if (subError || !submission) {
          return new Response(
            JSON.stringify({ error: "Submission not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (body.agent_slug) {
        const { data: agent, error: agentError } = await supabase
          .from("agents")
          .select("id")
          .eq("slug", body.agent_slug)
          .single();

        if (agentError || !agent) {
          return new Response(
            JSON.stringify({ error: "Agent not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Create flag record
      const flagId = crypto.randomUUID();
      const { error: flagError } = await supabase
        .from("agent_flags")
        .insert({
          id: flagId,
          submission_id: body.submission_id || null,
          agent_slug: body.agent_slug || null,
          flag_type: body.flag_type,
          details: body.details,
          reported_by: apiKey,
          resolved: false,
          created_at: new Date().toISOString(),
        });

      if (flagError) throw flagError;

      // For super-moderators, auto-resolve by removing/hiding content
      if (tier === "super_moderator" && body.flag_type !== "inaccurate") {
        if (body.submission_id) {
          await supabase
            .from("submissions")
            .update({ status: "flagged" })
            .eq("id", body.submission_id);
        }
      }

      return new Response(
        JSON.stringify({
          flag_id: flagId,
          status: "created",
          details:
            "Flag created and will be reviewed by moderators shortly.",
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
          error: "Failed to create flag",
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
