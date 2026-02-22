-- Basic schema for users, regions, invitations, posts, password resets
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password text,
  role text NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS user_regions (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  region_id uuid REFERENCES regions(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, region_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL,
  region_id uuid REFERENCES regions(id),
  token text NOT NULL,
  expires_at timestamptz,
  sent_count integer DEFAULT 0,
  accepted boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL,
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  title text,
  type text,
  content text,
  created_at timestamptz DEFAULT NOW()
);
