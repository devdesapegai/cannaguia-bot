import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export { pool };

export type VideoContext = {
  id: string;
  media_id: string | null;
  title: string;
  url: string;
  context_text: string;
  created_at: string;
  updated_at: string;
};
