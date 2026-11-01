-- Preview only. Requires owner approval before applying to persistent D1.
-- Apply once after checking PRAGMA table_info(observations).
-- NULL deliberately means historical/unknown methodology, never v5.7.
ALTER TABLE observations ADD COLUMN methodology_version TEXT;
