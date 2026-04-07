# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instagram bot for `@mariaconsultoracannabica` — responds to comments, DMs, and mentions using OpenAI LLM with a cannabis wellness consultant persona. Deployed on Vercel as a Next.js 16 app (App Router). Only the API routes are used; admin panel is the only frontend.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm test` — run all tests (Jest + ts-jest)
- `npx jest path/to/test` — run single test file
- `npx tsc --noEmit` — type-check without emitting

## TypeScript

- Path alias: `@/*` maps to `./src/*` (configured in tsconfig.json and jest.config.ts)

## Architecture

Three webhook flows share one endpoint (`POST /api/instagram/webhook`):

**Comments flow:**
```
Meta webhook → signature validation → dedup (Supabase) → cooldown (skip if @mentioned) →
input filter → rate limit (200/h, burst 300/h) → API dedup check →
fetch caption + video context + recent comments (parallel) →
reply style selector (4 weighted styles) + energy matching →
LLM (classify + respond, format: [category] reply) →
anti-repetition check (isDuplicateReply) →
post-process (150 char limit) → output filter → fallback rewrite if flagged →
delay (log-normal, 30s-3min) → post inline (<45s) or schedule to queue (>45s)
```

**DM flow:**
```
Meta webhook → entry.messaging[] → ignore echo → dedup → rate limit →
extract user profile → build conversation history →
LLM with profile + history context →
post-process (160 char limit) → output filter →
typing indicator + 5s delay → send reply →
if [WHATSAPP] tag or direct request: send generic template button card
```

**Mentions flow:**
```
Meta webhook → entry.changes[field=mentions] → dedup → rate limit →
fetch media caption + username → delay 15-45s →
LLM generates contextual comment → post-process → output filter →
comment on the post that mentioned us
```

## Key Files

- `src/app/api/instagram/webhook/route.ts` — webhook handler, routes comments, DMs, and mentions
- `src/lib/llm.ts` — comment reply generation, reply style integration, energy matching, anti-repetition
- `src/lib/dm.ts` — DM reply generation, WhatsApp redirect logic, typing indicator
- `src/lib/dm-history.ts` — per-user conversation history (Supabase, 10 msgs, 1h TTL)
- `src/lib/user-profile.ts` — auto-extracted user profiles (Supabase persistence)
- `src/lib/mentions.ts` — mention reply generation, comment on posts that tag us
- `src/lib/instagram.ts` — Graph API v21.0 client (reply, hide, caption, comments, dedup check, retry with exponential backoff)
- `src/lib/filters.ts` — input comment filter (spam→hide, risk→ignore, offensive→hater mode, emoji-only→respond)
- `src/lib/output-filter.ts` — banned term validation on LLM output
- `src/lib/post-process.ts` — `postProcess()` for comments (150 chars), `postProcessDm()` for DMs (160 chars)
- `src/lib/constants.ts` — single source for `OWN_USERNAME` and `PROFILE_HANDLE`
- `src/lib/reply-style.ts` — weighted random reply style selector (4 styles: reacao_pura, reacao_com_pergunta, humor_rotulo, pergunta_curta)
- `src/lib/energy.ts` — detects comment energy level (high/medium/low) for response matching
- `src/lib/delay.ts` — log-normal delay distribution (median 60s, range 30s-3min)
- `src/lib/smart-skip.ts` — category-based skip rates (currently all 0% — responds to everything)
- `src/lib/recent-replies.ts` — anti-repetition: stores last 20 replies in Supabase, isDuplicateReply() check
- `src/lib/supabase.ts` — Postgres pool, video context queries, failed replies queue, response logging, stats
- `src/lib/dedup.ts` — deduplication + cooldown (Supabase persistence)
- `src/lib/rate-limit.ts` — 200 replies/hour, burst 300/h for new posts
- `src/lib/admin-auth.ts` — HMAC-SHA256 session tokens, rate-limited login

## Admin Panel

- `/admin` — video context management (list Instagram posts, add context per video)
- `/admin/dashboard` — real-time stats: replies sent/failed, categories, retries, hourly breakdown
- `/admin/moderation` — review bot responses: OK/Ruim/Nota per response
- `/admin/login` — authentication (ADMIN_USERNAME/ADMIN_PASSWORD env vars)
- Protected by middleware (`src/middleware.ts`) using Web Crypto API (Edge Runtime compatible)

## Engagement Model

- **Reply styles**: 4 weighted styles — reacao_com_pergunta (45%), pergunta_curta (25%), reacao_pura (15%), humor_rotulo (15%)
- **First comment vs reply**: new comments (no parent_id) always get a question to open dialogue. Replies (has parent_id) use the weighted random selector.
- **Energy matching**: high-energy comments (KKKK, many emojis, caps) get high-energy responses.
- **Anti-repetition**: isDuplicateReply() checks last 20 replies for identical text, substrings, or matching first 5 words. If duplicate, regenerates with higher temperature.
- **Delay**: log-normal distribution (median 60s, range 30s-3min). Inline if <45s, queued for cron if >45s.
- **Rate limit**: 200/h normal, 300/h burst when new post detected.

## Database (Supabase PostgreSQL)

All state persists across Vercel cold starts:
- `video_contexts` — admin-managed context per Instagram post/reel
- `processed_comments` — deduplication
- `user_cooldowns` — per-user per-post cooldown (30 min)
- `rate_limit_window` — single-row hourly rate counter
- `dm_conversations` — per-user DM history (JSONB)
- `user_profiles` — extracted user profiles (JSONB)
- `recent_replies` — last 20 replies for anti-repetition
- `failed_replies` — retry queue + scheduled delayed posts
- `response_log` — all bot responses for moderation
- `bot_stats` — hourly stats (replies, failures, webhooks, errors, skips)

## Cron Job

External cron (cron-job.org) calls `GET /api/cron/retry?token=CRON_SECRET` every minute:
- Posts scheduled replies whose `next_retry_at` has passed
- Retries failed replies with exponential backoff (1min, 2min, 4min, 8min, 16min)
- Cleans up old records from dedup, cooldown, conversations, replies tables

## Runtime Patterns

- **Async processing**: webhook handler uses Next.js `after()` to process events after returning 200 to Meta.
- **Instagram API retry**: transient errors (codes 1, 2, 4, 17) retried 3 times with exponential backoff (2s, 4s, 8s).
- **Output fallback**: if LLM response contains banned terms, a rewrite is attempted (max 1 retry). If still flagged, discarded silently.
- **Cooldown bypass**: cooldown is skipped when user @mentions the bot directly.
- **Scheduled posting**: replies with delay >45s are saved to `failed_replies` with `next_retry_at` in the future. Cron job posts them when time comes.

## Important Patterns

- **LLM classification**: the model responds as `[category] reply text`. `parseResponse()` in llm.ts extracts both. Categories: zueira, elogio, duvida, desabafo, cultivo, hater, geral.
- **Reply style injection**: before each LLM call, a style instruction is appended to the system prompt telling the LLM whether to include a question and what tone to use.
- **Video context**: when a comment arrives on a post, the bot queries `video_contexts` table for admin-provided context and injects it into the LLM prompt separately from the caption.
- **Recent comments context**: bot fetches last 10 comments on the post via Graph API and injects them so the LLM understands the conversation.
- **Nested replies**: bot ignores nested comment replies UNLESS the reply text contains `@mariaconsultoracannabica`.
- **WhatsApp redirect in DMs**: LLM adds `[WHATSAPP]` tag when it detects the person needs personalized help. Mandatory when health conditions or legal cases are mentioned.
- **User profiles in DMs**: auto-extracted from messages. Gender-aware responses. Slang-aware ("criança", "menina", "gorda" = the plant, not flirting).
- **Token auth**: all Instagram API calls use `Authorization: Bearer` header, never query string.
- **Debug logging**: every pipeline decision is logged with reason and full webhook payload.

## Prompt Guidelines

- Prompts are written in Portuguese with proper accents — the model copies the style.
- Comment prompt is based on 564 real responses from Maria's viral post (data in `viral_post_data.json`). Style: short reactions (avg 29 chars), humor labels ("modo sobrevivência ativado 😂🔥"), almost always ends with 😂🔥.
- Vocabulary: always "plantinha/f1/beck/marola/bolado/larica/ganja/bolar/dischavar", never "maconha/cannabis/weed/baseado/fumar/chapado/stoner/enrolando".
- Audience is experienced cannabis users — questions should be peer-level ("bola ou seda?", "e a larica?"), never beginner-level ("já experimentou?").
- "Coxinha" means police officer in this niche — never use as food reference.
- DM prompt includes transparency rules (admits being AI assistant), PIX/money refusal, anti-flirting with slang awareness.
- Gender: unknown in comments (use neutral), extracted in DMs (use profile).

## Environment Variables

```
INSTAGRAM_ACCESS_TOKEN   — Instagram Graph API token
INSTAGRAM_APP_SECRET     — for webhook signature validation (HMAC-SHA256)
WEBHOOK_VERIFY_TOKEN     — for webhook subscription challenge
OPENAI_API_KEY           — OpenAI API key
OPENAI_MODEL             — model name (default: gpt-5.4-mini)
DATABASE_URL             — Supabase PostgreSQL connection string
ADMIN_USERNAME           — admin panel login
ADMIN_PASSWORD           — admin panel password
ADMIN_SECRET             — HMAC key for session token signing
CRON_SECRET              — token for cron endpoint authentication
```

## Constraints

- Vercel Hobby plan: `maxDuration = 60` seconds. Replies with delay >45s are queued for cron.
- Instagram Graph API does NOT support liking comments — don't try to re-add it.
- Rate limit: 200 replies/hour normal, 300/hour burst (Meta limit is 750).
- Meta webhook subscriptions needed: `comments`, `messages`, `mentions`.
- DM 24h window: can only reply within 24h of user's last message.
- Maria's videos have no audio (text/captions on screen only) — Whisper transcription doesn't work. Context must be manually added via admin panel.
- Middleware runs on Edge Runtime — use Web Crypto API, not Node.js crypto module.
