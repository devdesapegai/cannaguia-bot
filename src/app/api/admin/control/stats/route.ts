import { NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

export async function GET() {
  try {
    const [todayRes, categoriesRes, queueRes] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(replies_sent), 0) as sent,
           COALESCE(SUM(replies_failed), 0) as failed,
           COALESCE(SUM(webhooks_received), 0) as webhooks,
           COALESCE(SUM(errors), 0) as errors
         FROM bot_stats
         WHERE hour_bucket >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`
      ),
      pool.query(
        `SELECT category, COUNT(*)::int as count
         FROM response_log
         WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
           AND category IS NOT NULL
         GROUP BY category ORDER BY count DESC`
      ),
      pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE attempts < max_attempts AND next_retry_at <= now())::int as pending,
           COUNT(*) FILTER (WHERE next_retry_at > now() + interval '50 years')::int as paused
         FROM failed_replies`
      ),
    ]);

    return NextResponse.json({
      today: todayRes.rows[0],
      categories: categoriesRes.rows,
      queue: queueRes.rows[0],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
