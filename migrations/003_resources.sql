-- Defaults preserve compatibility with existing analysis-driven project/scene creation.
ALTER TABLE projects ADD COLUMN name text NOT NULL DEFAULT 'Untitled project';
ALTER TABLE scenes ADD COLUMN name text NOT NULL DEFAULT 'Untitled scene';
