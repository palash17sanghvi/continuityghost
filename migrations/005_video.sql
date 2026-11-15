CREATE TABLE videos (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('uploaded','processing','ready','failed')),
  duration_seconds double precision,
  width integer,
  height integer,
  fps double precision,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, scene_id, id),
  FOREIGN KEY (project_id, scene_id) REFERENCES scenes(project_id, id)
);
CREATE TABLE keyframes (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  video_id text NOT NULL,
  frame_index integer NOT NULL CHECK (frame_index >= 0),
  timestamp_seconds double precision NOT NULL CHECK (timestamp_seconds >= 0),
  shot_index integer NOT NULL CHECK (shot_index >= 0),
  width integer NOT NULL,
  height integer NOT NULL,
  PRIMARY KEY (project_id, scene_id, video_id, id),
  UNIQUE (project_id, scene_id, video_id, frame_index),
  FOREIGN KEY (project_id, scene_id, video_id) REFERENCES videos(project_id, scene_id, id)
);
CREATE TABLE video_analyses (
  id text NOT NULL,
  project_id text NOT NULL,
  scene_id text NOT NULL,
  video_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','completed','completed_with_errors','failed')),
  source text NOT NULL CHECK (source IN ('gemini','mock')),
  model text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  keyframe_count integer NOT NULL,
  pairs_planned integer NOT NULL,
  pairs_completed integer NOT NULL DEFAULT 0,
  pairs_failed integer NOT NULL DEFAULT 0,
  max_comparisons integer NOT NULL CHECK (max_comparisons BETWEEN 1 AND 8),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (project_id, scene_id, id),
  FOREIGN KEY (project_id, scene_id, video_id) REFERENCES videos(project_id, scene_id, id)
);
-- Links an existing findings row (reviewed through POST /api/reviews) to the two source frames.
CREATE TABLE video_findings (
  project_id text NOT NULL,
  scene_id text NOT NULL,
  analysis_id text NOT NULL,
  finding_id text NOT NULL,
  video_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('gemini','mock')),
  potential_issue text NOT NULL,
  earlier_keyframe_id text NOT NULL,
  later_keyframe_id text NOT NULL,
  PRIMARY KEY (project_id, scene_id, analysis_id, finding_id),
  FOREIGN KEY (project_id, scene_id, analysis_id, finding_id) REFERENCES findings(project_id, scene_id, analysis_id, id),
  FOREIGN KEY (project_id, scene_id, video_id, earlier_keyframe_id) REFERENCES keyframes(project_id, scene_id, video_id, id),
  FOREIGN KEY (project_id, scene_id, video_id, later_keyframe_id) REFERENCES keyframes(project_id, scene_id, video_id, id)
);
CREATE INDEX video_analyses_video_idx ON video_analyses (project_id, scene_id, video_id);
