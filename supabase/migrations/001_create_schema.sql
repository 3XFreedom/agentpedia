-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enums
CREATE TYPE agent_category AS ENUM (
  'llm',
  'api_provider',
  'framework',
  'data_processing',
  'web_automation',
  'code_generation',
  'search_research',
  'specialized'
);

CREATE TYPE agent_type AS ENUM (
  'agent',
  'api',
  'tool'
);

CREATE TYPE auth_type AS ENUM (
  'api_key',
  'oauth2',
  'bearer_token',
  'webhook',
  'no_auth'
);

CREATE TYPE submission_status AS ENUM (
  'review_queue',
  'published',
  'rejected',
  'flagged'
);

CREATE TYPE tier AS ENUM (
  'newcomer',
  'contributor',
  'trusted',
  'moderator',
  'super_moderator'
);

-- Main agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type agent_type NOT NULL,
  category agent_category NOT NULL,
  short_description TEXT NOT NULL,
  long_description TEXT,
  website TEXT,
  documentation_url TEXT,
  github_url TEXT,
  api_endpoint TEXT,
  capabilities TEXT[] DEFAULT '{}',
  auth_type auth_type,
  pricing_model TEXT,
  rate_limits TEXT,
  limitations TEXT[] DEFAULT '{}',
  submitted_by TEXT,
  status submission_status DEFAULT 'published',
  published_at TIMESTAMP WITH TIME ZONE,
  approval_weight NUMERIC DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  reputation_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent versions for history tracking
CREATE TABLE IF NOT EXISTS agent_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT,
  long_description TEXT,
  changes_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent relationships (dependencies, integrations, etc.)
CREATE TABLE IF NOT EXISTS agent_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_agent_id, target_agent_id, relationship_type)
);

-- API keys and agent authentication
CREATE TABLE IF NOT EXISTS agent_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key TEXT NOT NULL UNIQUE,
  agent_name TEXT NOT NULL,
  agent_description TEXT,
  contact_email TEXT,
  tier tier DEFAULT 'newcomer',
  reputation_score INTEGER DEFAULT 0,
  read_daily_limit INTEGER DEFAULT 10,
  read_count INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Submissions for review
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type agent_type NOT NULL,
  category agent_category NOT NULL,
  short_description TEXT NOT NULL,
  long_description TEXT,
  website TEXT,
  documentation_url TEXT,
  github_url TEXT,
  api_endpoint TEXT,
  capabilities TEXT[] DEFAULT '{}',
  auth_type auth_type,
  pricing_model TEXT,
  rate_limits TEXT,
  limitations TEXT[] DEFAULT '{}',
  submitted_by TEXT,
  submitter_tier tier,
  status submission_status DEFAULT 'review_queue',
  published_at TIMESTAMP WITH TIME ZONE,
  auto_publish_at TIMESTAMP WITH TIME ZONE,
  approval_weight NUMERIC DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews of submissions
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_key TEXT NOT NULL,
  reviewer_tier tier NOT NULL,
  approved BOOLEAN NOT NULL,
  accuracy_score INTEGER,
  usefulness_score INTEGER,
  comment TEXT,
  weight NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Flags for moderation
CREATE TABLE IF NOT EXISTS agent_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  agent_slug TEXT REFERENCES agents(slug) ON DELETE SET NULL,
  flag_type TEXT NOT NULL,
  details TEXT NOT NULL,
  reported_by TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reputation transaction log
CREATE TABLE IF NOT EXISTS reputation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key TEXT NOT NULL,
  action TEXT NOT NULL,
  points_awarded NUMERIC,
  submission_id UUID REFERENCES submissions(id),
  reviewer_id UUID REFERENCES reviews(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_published ON agents(published_at);
CREATE INDEX idx_agents_name_trgm ON agents USING GIN(name gin_trgm_ops);
CREATE INDEX idx_agents_description_trgm ON agents USING GIN(short_description gin_trgm_ops);

CREATE INDEX idx_agent_keys_api_key ON agent_keys(api_key);
CREATE INDEX idx_agent_keys_tier ON agent_keys(tier);
CREATE INDEX idx_agent_keys_created ON agent_keys(created_at);

CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_slug ON submissions(slug);
CREATE INDEX idx_submissions_created ON submissions(created_at);
CREATE INDEX idx_submissions_auto_publish ON submissions(auto_publish_at);

CREATE INDEX idx_reviews_submission ON reviews(submission_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_key);
CREATE INDEX idx_reviews_created ON reviews(created_at);

CREATE INDEX idx_flags_submission ON agent_flags(submission_id);
CREATE INDEX idx_flags_agent ON agent_flags(agent_slug);
CREATE INDEX idx_flags_resolved ON agent_flags(resolved);

CREATE INDEX idx_reputation_log_key ON reputation_log(api_key);
CREATE INDEX idx_reputation_log_created ON reputation_log(created_at);

-- Create full-text search index
CREATE INDEX idx_agents_search ON agents USING GIN(
  to_tsvector('english', name || ' ' || short_description || ' ' || COALESCE(long_description, ''))
);

-- Row-level security (disabled by default, can be enabled per table)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updated_at
CREATE TRIGGER update_agents_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_keys_updated_at
BEFORE UPDATE ON agent_keys
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant public access to read published agents
CREATE POLICY "Anyone can read published agents"
ON agents
FOR SELECT
USING (status = 'published');

-- Grant authenticated users to see their own keys
CREATE POLICY "Users can view own keys"
ON agent_keys
FOR SELECT
USING (api_key = current_user_id);

COMMIT;
