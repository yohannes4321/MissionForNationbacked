-- Content features: blogs, churches, richer posts, and mapping posts to churches

-- Existing tables upgrades
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW();

ALTER TABLE posts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_link text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_category_allowed'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_category_allowed
      CHECK (category IS NULL OR category IN ('special_program', 'mission', 'program_sunday'));
  END IF;
END $$;

-- Churches per region
CREATE TABLE IF NOT EXISTS churches (
  id uuid PRIMARY KEY,
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_link text,
  created_at timestamptz DEFAULT NOW()
);

-- Which church receives which post
CREATE TABLE IF NOT EXISTS post_churches (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, church_id)
);

-- Homepage blogs (super can create)
CREATE TABLE IF NOT EXISTS blogs (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  text text NOT NULL,
  image_url text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_region_created_at ON posts(region_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_expires_at ON posts(expires_at);
CREATE INDEX IF NOT EXISTS idx_churches_region_id ON churches(region_id);
CREATE INDEX IF NOT EXISTS idx_blogs_created_at ON blogs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_expires_at ON blogs(expires_at);
