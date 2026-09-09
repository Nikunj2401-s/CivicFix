-- CivicFix schema (PostgreSQL 12+, no extensions required)

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  name          text        NOT NULL,
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  role          text        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issues (
  id             serial PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_url      text,
  category       text    NOT NULL CHECK (category IN
                   ('pothole','garbage','water_leakage','broken_streetlight','road_damage')),
  description    text    NOT NULL,
  latitude       double precision NOT NULL CHECK (latitude  BETWEEN  -90 AND  90),
  longitude      double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  severity       smallint NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  status         text     NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','resolved')),
  upvotes        integer  NOT NULL DEFAULT 0,
  -- Priority Score = Severity x 10 + Upvotes, kept by the database itself
  priority_score integer  GENERATED ALWAYS AS (severity * 10 + upvotes) STORED,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- one vote per person per issue
CREATE TABLE IF NOT EXISTS issue_upvotes (
  issue_id   integer NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, user_id)
);

CREATE TABLE IF NOT EXISTS status_history (
  id         serial PRIMARY KEY,
  issue_id   integer NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  status     text    NOT NULL,
  changed_by integer REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- the duplicate check hits this every time someone files a report
CREATE INDEX IF NOT EXISTS idx_issues_cat_pos   ON issues (category, latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_issues_priority  ON issues (priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_user      ON issues (user_id);

-- great-circle distance in metres
CREATE OR REPLACE FUNCTION distance_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) RETURNS double precision AS $$
  SELECT 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  )));
$$ LANGUAGE sql IMMUTABLE;

-- keep issues.upvotes in step with the junction table
CREATE OR REPLACE FUNCTION sync_upvote_count() RETURNS trigger AS $$
DECLARE target integer;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.issue_id; ELSE target := NEW.issue_id; END IF;
  UPDATE issues SET upvotes = (
    SELECT count(*) FROM issue_upvotes WHERE issue_id = target
  ) WHERE id = target;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_upvotes ON issue_upvotes;
CREATE TRIGGER trg_sync_upvotes
AFTER INSERT OR DELETE ON issue_upvotes
FOR EACH ROW EXECUTE FUNCTION sync_upvote_count();

-- log every status change so residents can track progress
CREATE OR REPLACE FUNCTION log_status_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO status_history (issue_id, status) VALUES (NEW.id, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO status_history (issue_id, status) VALUES (NEW.id, NEW.status);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_status_history ON issues;
CREATE TRIGGER trg_status_history
AFTER INSERT OR UPDATE OF status ON issues
FOR EACH ROW EXECUTE FUNCTION log_status_change();
