import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

export interface VerifyResult {
  isValid: boolean;
  tier: string;
  agentName: string;
}

export async function verifyApiKey(
  apiKey: string,
  supabase: SupabaseClient
): Promise<VerifyResult> {
  try {
    const { data, error } = await supabase
      .from("agent_keys")
      .select("tier, agent_name, created_at")
      .eq("api_key", apiKey)
      .single();

    if (error || !data) {
      return { isValid: false, tier: "", agentName: "" };
    }

    // Check if key has expired (1 year of inactivity)
    const createdAt = new Date(data.created_at);
    const now = new Date();
    const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays > 365) {
      return { isValid: false, tier: "", agentName: "" };
    }

    return {
      isValid: true,
      tier: data.tier,
      agentName: data.agent_name,
    };
  } catch (error) {
    console.error("Auth verification error:", error);
    return { isValid: false, tier: "", agentName: "" };
  }
}

export async function checkReadLimit(
  apiKey: string,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("agent_keys")
      .select("tier, read_daily_limit, read_count")
      .eq("api_key", apiKey)
      .single();

    if (error || !data) {
      return false;
    }

    // Unlimited for contributor tier and above
    if (["contributor", "trusted", "moderator", "super_moderator"].includes(data.tier)) {
      return true;
    }

    // Check daily limit for newcomer
    if (data.tier === "newcomer") {
      const limit = data.read_daily_limit || 10;
      const count = data.read_count || 0;
      return count < limit;
    }

    return true;
  } catch (error) {
    console.error("Read limit check error:", error);
    return false;
  }
}

export async function incrementReadCount(
  apiKey: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const { data } = await supabase
      .from("agent_keys")
      .select("read_count")
      .eq("api_key", apiKey)
      .single();

    const newCount = (data?.read_count || 0) + 1;

    await supabase
      .from("agent_keys")
      .update({ read_count: newCount })
      .eq("api_key", apiKey);
  } catch (error) {
    console.error("Read count increment error:", error);
  }
}
