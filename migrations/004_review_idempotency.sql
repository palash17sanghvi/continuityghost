-- Requests and decisions are separate: several request keys may replay one decision.
CREATE TABLE review_requests (
  project_id text NOT NULL,
  scene_id text NOT NULL,
  analysis_id text NOT NULL,
  finding_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  decision_id text NOT NULL,
  PRIMARY KEY (project_id, scene_id, analysis_id, finding_id, idempotency_key),
  FOREIGN KEY (project_id, scene_id, analysis_id, finding_id, decision_id)
    REFERENCES review_decisions(project_id, scene_id, analysis_id, finding_id, id)
);
ALTER TABLE findings ADD COLUMN severity text CHECK (severity IN ('low','medium','high'));
ALTER TABLE findings ADD COLUMN confidence jsonb;
ALTER TABLE analyses ADD COLUMN memory_context jsonb;
