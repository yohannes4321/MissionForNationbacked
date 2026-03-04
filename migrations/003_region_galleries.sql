-- Regional galleries for dedicated gallery section

CREATE TABLE IF NOT EXISTS region_galleries (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  church_id uuid REFERENCES churches(id) ON DELETE SET NULL,
  caption text,
  image_url text NOT NULL,
  location_link text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_region_galleries_region_created_at
  ON region_galleries(region_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_region_galleries_expires_at
  ON region_galleries(expires_at);
