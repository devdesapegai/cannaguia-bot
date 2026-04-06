# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instagram bot for `@mariaconsultoracannabica` — responds to comments, DMs, and mentions using OpenAI LLM with a cannabis wellness consultant persona. Deployed on Vercel as a Next.js 16 app (App Router). Only the API routes are used; no frontend.

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
Meta webhook → signature validation → dedup → cooldown → input filter →
rate limit → API dedup check → fetch caption → delay 15-45s →
LLM (classify + respond in one call, format: [category] reply) →
post-process (150 char limit) → output filter → fallback rewrite if flagged →
post reply with @mention
```

**DM flow:**
```
Meta webhook → entry.messaging[] → ignore echo → dedup → rate limit →
extract user profile → build conversation history →
LLM with profile + history context →
post-process (250 char limit) → output filter →
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
- `src/lib/llm.ts` — comment reply generation, LLM-based classification via `[category]` format
- `src/lib/dm.ts` — DM reply generation, WhatsApp redirect logic, typing indicator, conversation history
- `src/lib/dm-history.ts` — per-user conversation history (in-memory, 10 msgs, 1h TTL)
- `src/lib/user-profile.ts` — auto-extracted user profiles (conditions, meds, gender, name, age, weight, cannabis use/products)
- `src/lib/mentions.ts` — mention reply generation, comment on posts that tag us
- `src/lib/instagram.ts` — Graph API v21.0 client (reply, hide, caption, dedup check)
- `src/lib/filters.ts` — input comment filter (spam→hide, risk→ignore, offensive→hater mode, emoji-only→respond)
- `src/lib/output-filter.ts` — banned term validation on LLM output
- `src/lib/post-process.ts` — `postProcess()` for comments (150 chars), `postProcessDm()` for DMs (250 chars)
- `src/lib/constants.ts` — single source for `OWN_USERNAME` and `PROFILE_HANDLE`

## Runtime Patterns

- **Async processing**: webhook handler uses Next.js `after()` to process events after returning 200 to Meta. All heavy work (LLM calls, API calls, delays) runs inside `after()`.
- **Instagram API retry**: transient errors (codes 1, 2, 4, 17) are retried once with 2s backoff.
- **Output fallback**: if LLM response contains banned terms, a rewrite is attempted (max 1 retry). If still flagged, the response is discarded silently.

## Important Patterns

- **LLM classification**: the model responds as `[category] reply text`. `parseResponse()` in llm.ts extracts both. Categories: zueira, elogio, duvida, desabafo, cultivo, hater, geral.
- **Nested replies**: bot ignores nested comment replies UNLESS the reply text contains `@mariaconsultoracannabica`. This allows people to continue conversations by mentioning the bot.
- **Emoji-only comments**: treated as engagement opportunities, NOT ignored. LLM validates the emoji and pulls a conversation hook.
- **WhatsApp redirect in DMs**: LLM adds `[WHATSAPP]` tag when it detects the person needs personalized help. Code sends a generic template button card. Direct regex also catches "zap", "whatsapp", "numero" etc. WhatsApp is only offered once per user (tracked in profile).
- **User profiles in DMs**: auto-extracted from messages — name, gender, age, weight, health conditions, medications, cannabis use stage, products used, interests. Profile is injected into LLM context. Gender-aware: "amiga/querida" for women, "amigo/mano" for men, "você" when unknown.
- **All in-memory state** (dedup, cooldown, rate limit, DM history, user profiles) resets on Vercel cold start. The `hasAlreadyReplied()` API check protects against duplicate comment replies.
- **Token auth**: all Instagram API calls use `Authorization: Bearer` header, never query string.
- **Username centralized**: `OWN_USERNAME` lives only in `constants.ts`. Prompts use `PROFILE_HANDLE` (interpolated from constants).
- **Debug logging**: every pipeline decision is logged with a reason. `processing_started` shows entry/change/msg counts. `comment_skipped` always includes reason (own_comment, nested_reply_no_mention, no_id_or_text). `caption_fetched`/`caption_empty` shows what context was available.

## Prompt Guidelines

- Prompts are written in Portuguese with proper accents — the model copies the style. Without accents, the model omits them too.
- Vocabulary rules: always "plantinha/f1/fitinho/uso medicinal", never "maconha/cannabis/weed/erva".
- Comment prompt requires `[category]` prefix format with engagement hook (question at the end).
- DM prompt is more personal (2 frases + pergunta), includes anti-repetition and WhatsApp detection instructions.
- Mention prompt adapts to context: recommendation→thank, personal story→empathy, meme→humor.

## Environment Variables

```
INSTAGRAM_ACCESS_TOKEN   — Instagram Graph API token
INSTAGRAM_APP_SECRET     — for webhook signature validation (HMAC-SHA256)
WEBHOOK_VERIFY_TOKEN     — for webhook subscription challenge
OPENAI_API_KEY           — OpenAI API key
OPENAI_MODEL             — model name (default: gpt-5.4-mini)
```

## Constraints

- Vercel Hobby plan: `maxDuration = 60` seconds. Comment delay (15-45s) + LLM (~3-5s) must fit within this.
- Instagram Graph API does NOT support liking comments — don't try to re-add it.
- Rate limit: 500 replies/hour (Meta limit is 750, margin of safety).
- Meta webhook subscriptions needed: `comments`, `messages`, `mentions`.
- DM 24h window: can only reply within 24h of user's last message.
- Caption is the ONLY context available for reels/posts — the API cannot access video content.
