// AgentPedia Shield - Content Protection Edge Function
// Production-ready Supabase Edge Function for managing AI agent access policies
// Handles site registration, policy management, agent agreements, and access control

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface RequestBody {
  email?: string;
  site_domain?: string;
  site_name?: string;
  policy_name?: string;
  path_pattern?: string;
  access_level?: string;
  terms_text?: string;
  allowed_uses?: string;
  prohibited_uses?: string;
  require_attribution?: boolean;
  rate_limit_per_hour?: number;
  policy_id?: string;
}

function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-agent-key, x-site-key, x-site-secret, content-type",
    "Content-Type": "application/json",
  };
}

function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(),
    });
  }
  return null;
}

function successResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: getCorsHeaders(),
  });
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: getCorsHeaders(),
  });
}

function generateRandomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleRegister(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as RequestBody;
    const { email, site_domain, site_name } = body;

    if (!email || !site_domain) {
      return errorResponse("email and site_domain are required");
    }

    const siteKey = "sk_" + generateRandomHex(12);
    const siteSecret = "ss_" + generateRandomHex(16);

    const { data: siteData, error: siteError } = await supabase
      .from("shield_sites")
      .insert({
        owner_email: email,
        site_domain,
        site_name: site_name || site_domain,
        site_key: siteKey,
        site_secret: siteSecret,
        default_access_level: "terms_required",
      })
      .select()
      .single();

    if (siteError) {
      return errorResponse(`Failed to register site: ${siteError.message}`, 400);
    }

    const defaultTerms =
      "By accessing this site as an AI agent, you agree to respect the site's terms of service and to identify yourself as an AI agent in your requests. You agree not to scrape, crawl, or index content without explicit permission.";

    const { data: policyData, error: policyError } = await supabase
      .from("shield_policies")
      .insert({
        site_id: siteData.id,
        policy_name: "Default Policy",
        path_pattern: "/*",
        access_level: "terms_required",
        terms_text: defaultTerms,
      })
      .select()
      .single();

    if (policyError) {
      return errorResponse(
        `Failed to create default policy: ${policyError.message}`,
        400
      );
    }

    return successResponse(
      {
        site_id: siteData.id,
        site_key: siteKey,
        site_secret: siteSecret,
        site_domain,
        site_name: site_name || site_domain,
        default_policy_id: policyData.id,
      },
      201
    );
  } catch (error) {
    return errorResponse(`Register failed: ${String(error)}`);
  }
}

async function handlePutPolicy(req: Request): Promise<Response> {
  try {
    const siteKey = req.headers.get("x-site-key");
    const siteSecret = req.headers.get("x-site-secret");

    if (!siteKey || !siteSecret) {
      return errorResponse("x-site-key and x-site-secret headers required", 401);
    }

    const { data: siteData, error: siteError } = await supabase
      .from("shield_sites")
      .select("id")
      .eq("site_key", siteKey)
      .eq("site_secret", siteSecret)
      .single();

    if (siteError || !siteData) {
      return errorResponse("Invalid site credentials", 401);
    }

    const body = (await req.json()) as RequestBody;
    const {
      policy_name,
      path_pattern = "/*",
      access_level = "terms_required",
      terms_text,
      allowed_uses,
      prohibited_uses,
      require_attribution,
      rate_limit_per_hour,
    } = body;

    if (!policy_name) {
      return errorResponse("policy_name is required");
    }

    const { data: policyData, error: policyError } = await supabase
      .from("shield_policies")
      .upsert({
        site_id: siteData.id,
        policy_name,
        path_pattern,
        access_level,
        terms_text:
          terms_text ||
          "Default policy terms for AI agent access to this site.",
        allowed_uses: allowed_uses || null,
        prohibited_uses: prohibited_uses || null,
        require_attribution: require_attribution || false,
        rate_limit_per_hour: rate_limit_per_hour || null,
      })
      .select()
      .single();

    if (policyError) {
      return errorResponse(`Failed to update policy: ${policyError.message}`, 400);
    }

    return successResponse(policyData, 200);
  } catch (error) {
    return errorResponse(`Update policy failed: ${String(error)}`);
  }
}

async function handleGetTerms(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const domain = url.searchParams.get("site");

    if (!domain) {
      return errorResponse("site query parameter required");
    }

    const { data: siteData, error: siteError } = await supabase
      .from("shield_sites")
      .select("id, site_name, site_domain, default_access_level")
      .eq("site_domain", domain)
      .single();

    if (siteError || !siteData) {
      return errorResponse("Site not found", 404);
    }

    const { data: policiesData, error: policiesError } = await supabase
      .from("shield_policies")
      .select(
        "id, policy_name, path_pattern, access_level, terms_text, allowed_uses, prohibited_uses, require_attribution, rate_limit_per_hour"
      )
      .eq("site_id", siteData.id)
      .eq("is_active", true);

    if (policiesError) {
      return errorResponse(
        `Failed to fetch policies: ${policiesError.message}`,
        400
      );
    }

    return successResponse({
      site_id: siteData.id,
      site_name: siteData.site_name,
      site_domain: siteData.site_domain,
      default_access_level: siteData.default_access_level,
      policies: policiesData || [],
    });
  } catch (error) {
    return errorResponse(`Get terms failed: ${String(error)}`);
  }
}

async function handleAgree(req: Request): Promise<Response> {
  try {
    const agentKey = req.headers.get("x-agent-key");

    if (!agentKey) {
      return errorResponse("x-agent-key header required", 401);
    }

    const body = (await req.json()) as RequestBody;
    const { site_domain, policy_id } = body;

    if (!site_domain) {
      return errorResponse("site_domain is required");
    }

    const { data: agentData, error: agentError } = await supabase
      .from("agents")
      .select("id, agent_name")
      .eq("api_key", agentKey)
      .single();

    if (agentError || !agentData) {
      return errorResponse("Agent not found", 404);
    }

    const { data: siteData, error: siteError } = await supabase
      .from("shield_sites")
      .select("id, site_key")
      .eq("site_domain", site_domain)
      .single();

    if (siteError || !siteData) {
      return errorResponse("Site not found", 404);
    }

    let policyData;
    if (policy_id) {
      const { data: pd, error: pe } = await supabase
        .from("shield_policies")
        .select("id, terms_text")
        .eq("id", policy_id)
        .eq("site_id", siteData.id)
        .single();

      if (pe || !pd) {
        return errorResponse("Policy not found", 404);
      }
      policyData = pd;
    } else {
      const { data: pd, error: pe } = await supabase
        .from("shield_policies")
        .select("id, terms_text")
        .eq("site_id", siteData.id)
        .eq("path_pattern", "/*")
        .single();

      if (pe || !pd) {
        return errorResponse("Default policy not found", 404);
      }
      policyData = pd;
    }

    const termsHash = await hashSha256(policyData.terms_text);
    const timestamp = new Date().toISOString();
    const watermark = `ap-${agentKey.substring(0, 8)}-${siteData.site_key.substring(0, 8)}-${timestamp}`;

    const { data: agreementData, error: agreementError } = await supabase
      .from("shield_agreements")
      .insert({
        site_id: siteData.id,
        policy_id: policyData.id,
        agent_key: agentKey,
        agent_name: agentData.agent_name,
        agent_watermark: watermark,
        terms_version: "1.0",
        terms_hash: termsHash,
      })
      .select()
      .single();

    if (agreementError) {
      return errorResponse(
        `Failed to create agreement: ${agreementError.message}`,
        400
      );
    }

    return successResponse(
      {
        agreement_id: agreementData.id,
        watermark,
        agent_name: agentData.agent_name,
        site_domain,
        accepted_at: agreementData.created_at,
        terms_hash: termsHash,
      },
      201
    );
  } catch (error) {
    return errorResponse(`Agree failed: ${String(error)}`);
  }
}

async function handleCheck(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const domain = url.searchParams.get("site");
    const path = url.searchParams.get("path") || "/";
    const agentKey = req.headers.get("x-agent-key");

    if (!domain) {
      return errorResponse("site query parameter required");
    }

    const { data: siteData, error: siteError } = await supabase
      .from("shield_sites")
      .select("id")
      .eq("site_domain", domain)
      .single();

    if (siteError || !siteData) {
      return errorResponse("Site not found", 404);
    }

    const { data: policiesData, error: policiesError } = await supabase
      .from("shield_policies")
      .select("id, path_pattern, access_level")
      .eq("site_id", siteData.id)
      .eq("is_active", true);

    if (policiesError || !policiesData || policiesData.length === 0) {
      return errorResponse("No policies found for site", 404);
    }

    let matchingPolicy = null;
    for (const policy of policiesData) {
      if (
        policy.path_pattern === "/*" ||
        path.startsWith(policy.path_pattern)
      ) {
        matchingPolicy = policy;
        break;
      }
    }

    if (!matchingPolicy) {
      matchingPolicy = policiesData[0];
    }

    let accessGranted = false;
    let reason = "Access denied";
    let agreementId = null;
    let watermark = null;

    if (matchingPolicy.access_level === "public") {
      accessGranted = true;
      reason = "Public access";
    } else if (matchingPolicy.access_level === "terms_required" && agentKey) {
      const { data: agreementData, error: agreementError } = await supabase
        .from("shield_agreements")
        .select("id, agent_watermark, is_revoked, expires_at")
        .eq("agent_key", agentKey)
        .eq("site_id", siteData.id)
        .eq("policy_id", matchingPolicy.id)
        .single();

      if (
        !agreementError &&
        agreementData &&
        !agreementData.is_revoked &&
        (!agreementData.expires_at ||
          new Date(agreementData.expires_at) > new Date())
      ) {
        accessGranted = true;
        reason = "Valid agreement";
        agreementId = agreementData.id;
        watermark = agreementData.agent_watermark;
      } else {
        reason = "Terms required - no valid agreement";
      }
    } else if (matchingPolicy.access_level === "terms_required") {
      reason = "Terms required - agent key not provided";
    }

    await supabase.from("shield_access_log").insert({
      site_id: siteData.id,
      policy_id: matchingPolicy.id,
      agent_key: agentKey || null,
      path,
      access_granted: accessGranted,
      reason,
    });

    return successResponse({
      access_granted: accessGranted,
      reason,
      agreement_id: agreementId,
      watermark,
      site_domain: domain,
      path,
    });
  } catch (error) {
    return errorResponse(`Check failed: ${String(error)}`);
  }
}

async function handleMyAgreements(req: Request): Promise<Response> {
  try {
    const agentKey = req.headers.get("x-agent-key");

    if (!agentKey) {
      return errorResponse("x-agent-key header required", 401);
    }

    const { data: agreementsData, error: agreementsError } = await supabase
      .from("shield_agreements")
      .select(
        `
        id,
        agent_name,
        agent_watermark,
        terms_version,
        terms_hash,
        is_revoked,
        expires_at,
        created_at,
        shield_sites(site_name, site_domain),
        shield_policies(policy_name, path_pattern, access_level)
      `
      )
      .eq("agent_key", agentKey)
      .order("created_at", { ascending: false });

    if (agreementsError) {
      return errorResponse(
        `Failed to fetch agreements: ${agreementsError.message}`,
        400
      );
    }

    const agreements = (agreementsData || []).map((agreement: any) => ({
      id: agreement.id,
      agent_name: agreement.agent_name,
      watermark: agreement.agent_watermark,
      site_name: agreement.shield_sites?.site_name,
      site_domain: agreement.shield_sites?.site_domain,
      policy_name: agreement.shield_policies?.policy_name,
      path_pattern: agreement.shield_policies?.path_pattern,
      access_level: agreement.shield_policies?.access_level,
      terms_version: agreement.terms_version,
      terms_hash: agreement.terms_hash,
      is_revoked: agreement.is_revoked,
      expires_at: agreement.expires_at,
      created_at: agreement.created_at,
    }));

    return successResponse({
      agent_key: agentKey,
      agreements_count: agreements.length,
      agreements,
    });
  } catch (error) {
    return errorResponse(`Get agreements failed: ${String(error)}`);
  }
}

async function handleDashboard(req: Request): Promise<Response> {
  try {
    const siteKey = req.headers.get("x-site-key");
    const siteSecret = req.headers.get("x-site-secret");

    if (!siteKey || !siteSecret) {
      return errorResponse("x-site-key and x-site-secret headers required", 401);
    }

    const { data: siteData, error: siteError } = await supabase
      .from("shield_sites")
      .select("id, site_name, site_domain")
      .eq("site_key", siteKey)
      .eq("site_secret", siteSecret)
      .single();

    if (siteError || !siteData) {
      return errorResponse("Invalid site credentials", 401);
    }

    const { count: accessLogsCount, error: logsError } = await supabase
      .from("shield_access_log")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteData.id)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const { count: agreementsCount, error: agreementsError } = await supabase
      .from("shield_agreements")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteData.id)
      .eq("is_revoked", false);

    const { data: recentLogs, error: recentError } = await supabase
      .from("shield_access_log")
      .select("path, access_granted, created_at")
      .eq("site_id", siteData.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (logsError || agreementsError) {
      return errorResponse("Failed to fetch dashboard data", 400);
    }

    return successResponse({
      site_id: siteData.id,
      site_name: siteData.site_name,
      site_domain: siteData.site_domain,
      recent_access_logs_count: accessLogsCount || 0,
      total_agreements: agreementsCount || 0,
      recent_access_logs: recentLogs || [],
    });
  } catch (error) {
    return errorResponse(`Dashboard failed: ${String(error)}`);
  }
}

async function handleStats(): Promise<Response> {
  try {
    const { count: sitesCount } = await supabase
      .from("shield_sites")
      .select("*", { count: "exact", head: true });

    const { count: agreementsCount } = await supabase
      .from("shield_agreements")
      .select("*", { count: "exact", head: true })
      .eq("is_revoked", false);

    const { count: recentRequestsCount } = await supabase
      .from("shield_access_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    return successResponse({
      total_sites: sitesCount || 0,
      total_active_agreements: agreementsCount || 0,
      recent_requests_24h: recentRequestsCount || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(`Stats failed: ${String(error)}`);
  }
}

async function handler(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) {
    return corsResponse;
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  const shieldIndex = pathname.indexOf("/shield");
  if (shieldIndex === -1) {
    return errorResponse("Invalid route", 404);
  }

  const route = pathname.substring(shieldIndex + 6);

  if (req.method === "POST" && route === "/register") {
    return await handleRegister(req);
  } else if (req.method === "PUT" && route === "/policy") {
    return await handlePutPolicy(req);
  } else if (req.method === "GET" && route === "/terms") {
    return await handleGetTerms(req);
  } else if (req.method === "POST" && route === "/agree") {
    return await handleAgree(req);
  } else if (req.method === "GET" && route === "/check") {
    return await handleCheck(req);
  } else if (req.method === "GET" && route === "/my-agreements") {
    return await handleMyAgreements(req);
  } else if (req.method === "GET" && route === "/dashboard") {
    return await handleDashboard(req);
  } else if (req.method === "GET" && route === "/stats") {
    return await handleStats();
  } else {
    return errorResponse(`Route not found: ${req.method} ${route}`, 404);
  }
}

Deno.serve(handler);
