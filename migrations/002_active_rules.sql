ALTER TABLE continuity_rules ADD COLUMN active boolean NOT NULL DEFAULT false;
-- Upgrade existing history deterministically: only latest decision per finding is active.
WITH latest AS (
  SELECT DISTINCT ON (project_id, scene_id, analysis_id, finding_id) id
  FROM continuity_rules
  ORDER BY project_id, scene_id, analysis_id, finding_id, created_at DESC, id DESC
)
UPDATE continuity_rules SET active=true WHERE id IN (SELECT id FROM latest);
ALTER TABLE continuity_rules ALTER COLUMN active SET DEFAULT true;
CREATE UNIQUE INDEX continuity_rules_active_finding_idx
  ON continuity_rules (project_id, scene_id, analysis_id, finding_id) WHERE active;
