-- Store image/video upload metadata for listing and filtering.
CREATE TABLE IF NOT EXISTS media_uploads (
  id uuid PRIMARY KEY,
  uploader_id uuid REFERENCES users(id) ON DELETE SET NULL,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  church_id uuid REFERENCES churches(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  title text,
  media_type text,
  description text,
  caption text,
  public_id text UNIQUE NOT NULL,
  format text,
  secure_url text UNIQUE NOT NULL,
  url text,
  bytes integer,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_resource_created_at
  ON media_uploads(resource_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_uploads_region_created_at
  ON media_uploads(region_id, created_at DESC);
