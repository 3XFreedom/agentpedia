-- Add Terms of Service enforcement and data watermarking

-- ToS tracking on agent_keys
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS tos_version text DEFAULT '1.0';
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS watermark_id text;
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS flagged_for_scraping boolean DEFAULT false;
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS scraping_score numeric(5,2) DEFAULT 0;

-- Terms of Service version tracking
CREATE TABLE IF NOT EXISTS terms_of_service (
  version text PRIMARY KEY,
  effective_date timestamptz NOT NULL DEFAULT now(),
  content text NOT NULL,
  requires_reaccept boolean DEFAULT false
);

-- Scraping detection: track request patterns per hour
CREATE TABLE IF NOT EXISTS request_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  endpoint text NOT NULL,
  request_count integer DEFAULT 1,
  unique_slugs_accessed integer DEFAULT 0,
  sequential_reads boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(api_key, window_start, endpoint)
);

CREATE INDEX idx_request_patterns_key ON request_patterns(api_key);
CREATE INDEX idx_request_patterns_window ON request_patterns(window_start);

ALTER TABLE request_patterns ENABLE ROW LEVEL SECURITY;
