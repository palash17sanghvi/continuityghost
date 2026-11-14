CREATE TABLE projects (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scenes (
  project_id text NOT NULL REFERENCES projects(id),
  id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);
CREATE TABLE analyses (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed','failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
  PRIMARY KEY (project_id, scene_id, id),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id)
);
CREATE TABLE findings (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  analysis_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('wardrobe','props','placement','appearance','action','background')),
  description text NOT NULL,
  reference_evidence text NOT NULL,
  candidate_evidence text NOT NULL,
  uncertainty text NOT NULL,
  suggested_action text NOT NULL,
  status text NOT NULL CHECK (status IN ('unreviewed','confirmed','dismissed','intentional')),
  detected_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, scene_id, analysis_id, id),
  FOREIGN KEY (project_id, scene_id, analysis_id) REFERENCES analyses(project_id, scene_id, id)
);
CREATE TABLE review_decisions (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  analysis_id text NOT NULL,
  finding_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','dismissed','intentional')),
  note text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, scene_id, analysis_id, finding_id, id),
  FOREIGN KEY (project_id, scene_id, analysis_id, finding_id) REFERENCES findings(project_id, scene_id, analysis_id, id)
);
CREATE TABLE continuity_rules (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  analysis_id text NOT NULL,
  finding_id text NOT NULL,
  decision_id text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (project_id, scene_id, analysis_id, finding_id, decision_id) REFERENCES review_decisions(project_id, scene_id, analysis_id, finding_id, id)
);
CREATE TABLE events (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  analysis_id text NOT NULL,
  finding_id text,
  event_type text NOT NULL CHECK (event_type IN ('analysis_started','analysis_completed','analysis_failed','finding_detected','review_confirmed','review_dismissed','review_intentional')),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, occurred_at),
  FOREIGN KEY (project_id, scene_id, analysis_id) REFERENCES analyses(project_id, scene_id, id),
  FOREIGN KEY (project_id, scene_id, analysis_id, finding_id) REFERENCES findings(project_id, scene_id, analysis_id, id),
  CHECK ((event_type IN ('finding_detected','review_confirmed','review_dismissed','review_intentional')) = (finding_id IS NOT NULL))
);
CREATE INDEX events_project_time_idx ON events(project_id, occurred_at DESC);
CREATE INDEX findings_project_category_idx ON findings(project_id, category);
CREATE INDEX findings_project_status_idx ON findings(project_id, status);

-- Never install an extension. Use an already-installed TimescaleDB only.
-- Unique event key includes the partition timestamp, as required by hypertables.
DO $optional_timescale$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('events', by_range('occurred_at'), if_not_exists => TRUE);
  END IF;
END
$optional_timescale$;
