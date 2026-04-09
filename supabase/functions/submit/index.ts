import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyApiKey } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface SubmitRequest {
  name: string;
  slug: string;
  type: string;
  category: string;
  short_description: string;
  long_description?: string;
  website?: string;
  documentation_url?: string;
  github_url?: string;
  api_endpoint?: string;
  capabilities?: string[];
  auth_type?: string;
  pricing_model?: string;
  rate_limits?: string;
  limitations?: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-agent-key");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "x-agent-key header is required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: SubmitRequest = await req.json();

    // Validate required fields
    if (!body.name || !body.slug || !body.type || !body.category) {
      return new Response(
        JSON.stringify({
          error:
            "Required fields: name, slug, type, category, short_description",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify API key and get agent tier
    const { isValid, tier, agentName } = await verifyApiKey(
      apiKey,
      supabase
    );
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if slug already exists
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("slug", body.slug)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({
          error: "Slug already exists. Please use a unique slug.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create submission
    const submissionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Auto-publish for super-moderators, auto-queue for others
    const autoPublishAt =
      tier === "super_moderator"
        ? now
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const autoPublish = tier === "super_moderator";

    const { data: submission, error: submitError } = await supabase
      .from("submissions")
      .insert({
        id: submissionId,
        name: body.name,
        slug: body.slug,
        type: body.type,
        category: body.category,
        short_description: body.short_description,
        long_description: body.long_description || null,
        website: body.website || null,
        documentation_url: body.documentation_url || null,
        github_url: body.github_url || null,
        api_endpoint: body.api_endpoint || null,
        capabilities: body.capabilities || [],
        auth_type: body.auth_type || null,
        pricing_model: body.pricing_model || null,
        rate_limits: body.rate_limits || null,
        limitations: body.limitations || [],
        submitted_by: apiKey,
        submitter_tier: tier,
        status: autoPublish ? "published" : "review_queue",
        published_at: autoPublish ? now : null,
        auto_publish_at: autoPublishAt,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (submitError) {
      console.error("Submission error:", submitError);
      throw submitError;
    }

    return new Response(
      JSON.stringify({
        submission_id: submissionId,
        status: autoPublish ? "published" : "review_queue",
        created_at: now,
        auto_publish_at: autoPublishAt,
        message: autoPublish
          ? "Submission published immediately (Super-Moderator privilege)"
          : "Submission queued for review. It will auto-publish in 24 hours if not flagged.",
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
        error: "Failed to submit entry",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
