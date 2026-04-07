import { NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

export async function GET() {
  try {
    // Stats das ultimas 24h
    const { rows: stats } = await pool.query(
      `SELECT hour_bucket, replies_sent, replies_failed, webhooks_received, errors, categories
       FROM bot_stats
       WHERE hour_bucket > now() - interval '24 hours'
       ORDER BY hour_bucket DESC`,
    );

    // Totais das ultimas 24h
    const { rows: totals } = await pool.query(
      `SELECT
         COALESCE(SUM(replies_sent), 0) as total_sent,
         COALESCE(SUM(replies_failed), 0) as total_failed,
         COALESCE(SUM(webhooks_received), 0) as total_webhooks,
         COALESCE(SUM(errors), 0) as total_errors
       FROM bot_stats
       WHERE hour_bucket > now() - interval '24 hours'`,
    );

    // Breakdown por categoria (ultimas 24h do response_log)
    const { rows: categories } = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM response_log
       WHERE created_at > now() - interval '24 hours' AND category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`,
    );

    // Breakdown por tipo de reply
    const { rows: replyTypes } = await pool.query(
      `SELECT reply_type, COUNT(*) as count
       FROM response_log
       WHERE created_at > now() - interval '24 hours'
       GROUP BY reply_type
       ORDER BY count DESC`,
    );

    // Retries pendentes
    const { rows: retries } = await pool.query(
      `SELECT COUNT(*) as pending FROM failed_replies WHERE attempts < max_attempts`,
    );

    // Moderacao pendente
    const { rows: moderation } = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE reviewed) as reviewed,
         COUNT(*) FILTER (WHERE NOT reviewed) as pending
       FROM response_log
       WHERE created_at > now() - interval '24 hours'`,
    );

    return NextResponse.json({
      hourly: stats,
      totals: totals[0] || { total_sent: 0, total_failed: 0, total_webhooks: 0, total_errors: 0 },
      categories,
      replyTypes,
      pendingRetries: parseInt(retries[0]?.pending || "0"),
      moderation: moderation[0] || { total: 0, reviewed: 0, pending: 0 },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
