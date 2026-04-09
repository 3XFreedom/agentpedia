-- Health check system for monitoring agent/tool/API availability

CREATE TABLE IF NOT EXISTS health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('up', 'down', 'degraded', 'timeout', 'unknown')),
  response_time_ms integer,
  http_status integer,
  error_message text,
  check_type text NOT NULL DEFAULT 'http' CHECK (check_type IN ('http', 'dns', 'tcp', 'mcp'))
);

CREATE INDEX idx_health_checks_agent_id ON health_checks(agent_id);
CREATE INDEX idx_health_checks_checked_at ON health_checks(checked_at DESC);
CREATE INDEX idx_health_checks_agent_latest ON health_checks(agent_id, checked_at DESC);

-- Aggregated health status per agent
CREATE TABLE IF NOT EXISTS agent_health_status (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  current_status text NOT NULL DEFAULT 'unknown' CHECK (current_status IN ('up', 'down', 'degraded', 'timeout', 'unknown')),
  last_checked_at timestamptz,
  last_up_at timestamptz,
  last_down_at timestamptz,
  avg_response_time_ms integer,
  uptime_percent_7d numeric(5,2) DEFAULT 0,
  uptime_percent_30d numeric(5,2) DEFAULT 0,
  consecutive_failures integer DEFAULT 0,
  total_checks integer DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add health columns to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS health_check_url text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_known_status text DEFAULT 'unknown';

-- Enable RLS
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_health_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_checks_public_read" ON health_checks
  FOR SELECT USING (true);
CREATE POLICY "agent_health_status_public_read" ON agent_health_status
  FOR SELECT USING (true);

-- View: agents with current health
CREATE OR REPLACE VIEW agents_with_health AS
SELECT
  a.*,
  h.current_status AS health_status,
  h.last_checked_at AS health_last_checked,
  h.avg_response_time_ms AS health_avg_response_ms,
  h.uptime_percent_7d AS health_uptime_7d,
  h.uptime_percent_30d AS health_uptime_30d,
  h.consecutive_failures AS health_consecutive_failures
FROM agents a
LEFT JOIN agent_health_status h ON a.id = h.agent_id;
