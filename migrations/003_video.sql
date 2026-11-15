-- Video documents retain clip metadata, keyframes, pairs and evidence without changing still-image tables.
CREATE TABLE video_analyses (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  created_at timestamptz NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  document jsonb NOT NULL,
  UNIQUE (project_id, scene_id, id),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id)
);
CREATE INDEX video_history_scope ON video_analyses(project_id, scene_id, created_at DESC);

-- Append-only human decisions. Latest decision per finding determines active approved rules.
CREATE TABLE video_review_decisions (
  id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  finding_id uuid NOT NULL,
  revision integer NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','dismissed','intentional')),
  note text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (analysis_id, revision),
  FOREIGN KEY (project_id, scene_id, analysis_id) REFERENCES video_analyses(project_id, scene_id, id)
);
CREATE INDEX video_rules_scope ON video_review_decisions(project_id, scene_id, analysis_id, finding_id, revision DESC);
