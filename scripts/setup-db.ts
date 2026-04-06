import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function setup() {
  await client.connect();
  console.log("Connected to Supabase Postgres");

  await client.query(`
    CREATE TABLE IF NOT EXISTS video_contexts (
      id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      media_id    TEXT UNIQUE,
      title       TEXT NOT NULL,
      url         TEXT NOT NULL,
      context_text TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_video_contexts_media_id ON video_contexts(media_id);

    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_video_contexts_updated_at ON video_contexts;
    CREATE TRIGGER trg_video_contexts_updated_at
      BEFORE UPDATE ON video_contexts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);

  console.log("Table video_contexts created successfully");
  await client.end();
}

setup().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
