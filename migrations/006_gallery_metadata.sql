-- Add optional metadata fields for regional gallery entries.
ALTER TABLE region_galleries ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE region_galleries ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE region_galleries ADD COLUMN IF NOT EXISTS description text;
