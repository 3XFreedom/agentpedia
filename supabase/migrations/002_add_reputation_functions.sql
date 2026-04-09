-- Function to calculate agent tier based on reputation score
CREATE OR REPLACE FUNCTION calculate_tier(reputation_score INTEGER)
RETURNS TEXT AS $$
BEGIN
  CASE
    WHEN reputation_score >= 100 THEN RETURN 'super_moderator';
    WHEN reputation_score >= 50 THEN RETURN 'moderator';
    WHEN reputation_score >= 25 THEN RETURN 'trusted';
    WHEN reputation_score >= 5 THEN RETURN 'contributor';
    ELSE RETURN 'newcomer';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if a submission should auto-publish
CREATE OR REPLACE FUNCTION check_auto_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-publish if approval weight >= 5.0
  IF NEW.approval_weight >= 5.0 AND NEW.status = 'review_queue' THEN
    NEW.status := 'published'::submission_status;
    NEW.published_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-publish when weight threshold is reached
CREATE TRIGGER auto_publish_on_weight
BEFORE UPDATE ON submissions
FOR EACH ROW
WHEN (OLD.approval_weight IS DISTINCT FROM NEW.approval_weight)
EXECUTE FUNCTION check_auto_publish();

-- Function to award reputation points
CREATE OR REPLACE FUNCTION award_reputation_points(
  p_api_key TEXT,
  p_points NUMERIC,
  p_action TEXT,
  p_submission_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_current_score INTEGER;
  v_new_score INTEGER;
  v_new_tier TEXT;
BEGIN
  -- Update agent_keys with new score
  UPDATE agent_keys
  SET reputation_score = reputation_score + p_points::INTEGER
  WHERE api_key = p_api_key
  RETURNING reputation_score INTO v_new_score;

  -- Calculate new tier
  SELECT calculate_tier(v_new_score) INTO v_new_tier;

  -- Update tier if changed
  UPDATE agent_keys
  SET tier = v_new_tier::tier
  WHERE api_key = p_api_key;

  -- Log the transaction
  INSERT INTO reputation_log (api_key, action, points_awarded, submission_id, created_at)
  VALUES (p_api_key, p_action, p_points, p_submission_id, NOW());
END;
$$ LANGUAGE plpgsql;

-- Function for incrementing reputation (used in reviews)
CREATE OR REPLACE FUNCTION increment_reputation(
  p_api_key TEXT,
  p_points NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_new_score INTEGER;
BEGIN
  UPDATE agent_keys
  SET reputation_score = reputation_score + p_points::INTEGER
  WHERE api_key = p_api_key
  RETURNING reputation_score INTO v_new_score;

  RETURN v_new_score;
END;
$$ LANGUAGE plpgsql;

-- Function to get agent statistics
CREATE OR REPLACE FUNCTION get_agent_stats(p_agent_slug TEXT)
RETURNS TABLE (
  submission_count BIGINT,
  review_count BIGINT,
  average_rating NUMERIC,
  total_reputation INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT s.id)::BIGINT,
    COUNT(DISTINCT r.id)::BIGINT,
    AVG(r.accuracy_score)::NUMERIC,
    COALESCE(a.reputation_score, 0)::INTEGER
  FROM agents a
  LEFT JOIN submissions s ON a.slug = s.slug
  LEFT JOIN reviews r ON s.id = r.submission_id
  WHERE a.slug = p_agent_slug;
END;
$$ LANGUAGE plpgsql;

-- Function to get leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_metric TEXT DEFAULT 'reputation',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  agent_name TEXT,
  tier TEXT,
  metric_value BIGINT,
  reputation_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.agent_name,
    ak.tier::TEXT,
    CASE
      WHEN p_metric = 'reads' THEN ak.read_count::BIGINT
      WHEN p_metric = 'reviews' THEN ak.review_count::BIGINT
      WHEN p_metric = 'entries' THEN ak.submission_count::BIGINT
      ELSE ak.reputation_score::BIGINT
    END,
    ak.reputation_score
  FROM agent_keys ak
  ORDER BY
    CASE
      WHEN p_metric = 'reads' THEN ak.read_count
      WHEN p_metric = 'reviews' THEN ak.review_count
      WHEN p_metric = 'entries' THEN ak.submission_count
      ELSE ak.reputation_score
    END DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to reset daily read count (can be called by a scheduled job)
CREATE OR REPLACE FUNCTION reset_daily_reads()
RETURNS VOID AS $$
BEGIN
  UPDATE agent_keys
  SET read_count = 0
  WHERE tier = 'newcomer'::tier;
END;
$$ LANGUAGE plpgsql;

COMMIT;
