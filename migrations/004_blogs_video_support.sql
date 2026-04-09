-- Allow homepage blogs to carry image and/or video media.
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE blogs ALTER COLUMN image_url DROP NOT NULL;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();
