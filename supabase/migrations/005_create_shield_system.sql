-- AgentPedia Shield: Content Protection + Agentic Agreements

-- Sites registered for Shield protection
CREATE TABLE IF NOT EXISTS shield_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  owner_name text,
  site_domain text NOT NULL UNIQUE,
  site_name text,
  site_key text NOT NULL UNIQUE,
  site_secret text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  verified boolean DEFAULT false,
  verification_token text,
  default_access_level text NOT NULL DEFAULT 'terms_required'
    CHECK (default_access_level IN ('open', 'terms_required', 'approved_only', 'block_all')),
  agent_registration_required boolean DEFAULT true,
  monthly_agent_requests integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shield_sites_domain ON shield_sites(site_domain);
CREATE INDEX idx_shield_sites_key ON shield_sites(site_key);

-- Content policies: per-site or per-path rules
CREATE TABLE IF NOT EXISTS shield_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES shield_sites(id) ON DELETE CASCADE,
  policy_name text NOT NULL,
  path_pattern text DEFAULT '/*',
  access_level text NOT NULL DEFAULT 'terms_required'
    CHECK (access_level IN ('open', 'terms_required', 'approved_only', 'block_all')),
  terms_text text,
  terms_version text DEFAULT '1.0',
  allowed_uses text[] DEFAULT ARRAY['read', 'summarize', 'reference'],
  prohibited_uses text[] DEFAULT ARRAY['train', 'reproduce', 'redistribute'],
  require_attribution boolean DEFAULT true,
  attribution_format text DEFAULT 'Source: {site_name} ({site_url})',
  max_cache_seconds integer DEFAULT 86400,
  rate_limit_per_hour integer DEFAULT 60,
  priority integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Agentic agreements: signed terms between agents and sites
CREATE TABLE IF NOT EXISTS shield_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES shield_sites(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES shield_policies(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  agent_name text,
  agent_watermark text NOT NULL,
  terms_version text NOT NULL,
  terms_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked boolean DEFAULT false,
  revoked_at timestamptz,
  revoke_reason text,
  UNIQUE(site_id, agent_key, policy_id, terms_version)
);

-- Access log
CREATE TABLE IF NOT EXISTS shield_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES shield_sites(id) ON DELETE CASCADE,
  agent_key text,
  agent_name text,
  agreement_id uuid REFERENCES shield_agreements(id),
  request_path text,
  request_method text DEFAULT 'GET',
  access_granted boolean NOT NULL,
  denial_reason text,
  watermark_applied text,
  response_time_ms integer,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

-- Approved agents (for approved_only access level)
CREATE TABLE IF NOT EXISTS shield_approved_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES shield_sites(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  approved_by text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE(site_id, agent_key)
);

-- Violation reports
CREATE TABLE IF NOT EXISTS shield_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES shield_sites(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  agreement_id uuid REFERENCES shield_agreements(id),
  violation_type text NOT NULL CHECK (violation_type IN (
    'unauthorized_reproduction', 'training_use', 'no_attribution',
    'exceeded_rate_limit', 'scraping', 'redistribution', 'other'
  )),
  evidence_url text,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'confirmed', 'dismissed')),
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Daily stats
CREATE TABLE IF NOT EXISTS shield_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES shield_sites(id) ON DELETE CASCADE,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  total_requests integer DEFAULT 0,
  granted_requests integer DEFAULT 0,
  blocked_requests integer DEFAULT 0,
  unique_agents integer DEFAULT 0,
  new_agreements integer DEFAULT 0,
  violations_reported integer DEFAULT 0,
  UNIQUE(site_id, stat_date)
);

-- Enable RLS
ALTER TABLE shield_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_approved_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shield_daily_stats ENABLE ROW LEVEL SECURITY;

-- Public read on agreements and policies (agents need to check)
CREATE POLICY "shield_agreements_public_read" ON shield_agreements FOR SELECT USING (true);
CREATE POLICY "shield_policies_public_read" ON shield_policies FOR SELECT USING (true);
