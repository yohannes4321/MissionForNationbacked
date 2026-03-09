-- Detailed church profile fields for church detail screens
ALTER TABLE churches ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS hero_image text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS service_times jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS announcements jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS pastor jsonb;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS ministries jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS map_url text;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_churches_region_external_id_unique
  ON churches(region_id, external_id)
  WHERE external_id IS NOT NULL;
