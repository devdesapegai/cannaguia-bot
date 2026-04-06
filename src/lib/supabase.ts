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

export async function getVideoContext(mediaId: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      "SELECT context_text FROM video_contexts WHERE media_id = $1",
      [mediaId]
    );
    return rows[0]?.context_text || "";
  } catch {
    return "";
  }
}

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
