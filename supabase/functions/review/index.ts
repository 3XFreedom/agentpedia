import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyApiKey } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface ReviewRequest {
  submission_id: string;
  approved: boolean;
  accuracy_score?: number;
  usefulness_score?: number;
  comment?: string;
}

const TIER_WEIGHTS: Record<string, number> = {
  newcomer: 0.5,
  contributor: 1.0,
  trusted: 1.5,
  moderator: 2.0,
  super_moderator: 3.0,
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const apiKey = req.headers.get("x-agent-key");

  // Handle GET /review (get review queue)
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("submissions")
      .select(
        "id, name, type, category, submitter_tier, created_at, approval_weight, review_count"
      )
      .eq("status", "review_queue")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    return new Response(JSON.stringify(data || []), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle POST /review (submit review)
  if (req.method === "POST") {
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "x-agent-key header is required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    try {
      const body: ReviewRequest = await req.json();

      if (!body.submission_id) {
        return new Response(
          JSON.stringify({ error: "submission_id is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify API key
      const { isValid, tier } = await verifyApiKey(apiKey, supabase);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get submission
      const { data: submission, error: subError } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", body.submission_id)
        .single();

      if (subError || !submission) {
        return new Response(
          JSON.stringify({ error: "Submission not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create review record
      const reviewId = crypto.randomUUID();
      const weight = TIER_WEIGHTS[tier] || 0.5;
      const newTotalWeight =
        (submission.approval_weight || 0) + (body.approved ? weight : -weight * 0.5);
      const newReviewCount = (submission.review_count || 0) + 1;

      const { error: reviewError } = await supabase
        .from("reviews")
        .insert({
          id: reviewId,
          submission_id: body.submission_id,
          reviewer_key: apiKey,
          reviewer_tier: tier,
          approved: body.approved,
          accuracy_score: body.accuracy_score || null,
          usefulness_score: body.usefulness_score || null,
          comment: body.comment || null,
          weight: weight,
          created_at: new Date().toISOString(),
        });

      if (reviewError) throw reviewError;

      // Update submission approval weight and review count
      const newStatus =
        newTotalWeight >= 5.0 ? "published" : "review_queue";
      const publishedAt =
        newStatus === "published"
          ? new Date().toISOString()
          : submission.published_at;

      const { error: updateError } = await supabase
        .from("submissions")
        .update({
          approval_weight: newTotalWeight,
          review_count: newReviewCount,
          status: newStatus,
          published_at: publishedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.submission_id);

      if (updateError) throw updateError;

      // Award reputation points to reviewer
      const pointsAwarded = body.approved ? 1 : 0.5;
      const { error: repError } = await supabase
        .from("agent_keys")
        .update({
          reputation_score: supabase.rpc("increment_reputation", {
            key: apiKey,
            points: pointsAwarded,
          }),
          review_count: newReviewCount,
        })
        .eq("api_key", apiKey);

      // If auto-published, create the agent entry
      if (newStatus === "published" && !submission.published_at) {
        const { error: agentError } = await supabase
          .from("agents")
          .insert({
            id: crypto.randomUUID(),
            slug: submission.slug,
            name: submission.name,
            type: submission.type,
            category: submission.category,
            short_description: submission.short_description,
            long_description: submission.long_description,
            website: submission.website,
            documentation_url: submission.documentation_url,
            github_url: submission.github_url,
            api_endpoint: submission.api_endpoint,
            capabilities: submission.capabilities,
            auth_type: submission.auth_type,
            pricing_model: submission.pricing_model,
            rate_limits: submission.rate_limits,
            limitations: submission.limitations,
            submitted_by: submission.submitted_by,
            status: "published",
            published_at: publishedAt,
            approval_weight: newTotalWeight,
            review_count: newReviewCount,
            rating: 0,
            reputation_score: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (agentError) console.error("Agent creation error:", agentError);
      }

      return new Response(
        JSON.stringify({
          review_id: reviewId,
          submission_status: newStatus,
          approval_weight: newTotalWeight,
          review_count: newReviewCount,
          reputation_awarded: pointsAwarded,
          message:
            newStatus === "published"
              ? "Review submitted and entry published!"
              : `Review submitted. Approval weight: ${newTotalWeight.toFixed(1)}/5.0`,
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
          error: "Failed to submit review",
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
