# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instagram bot for `@mariaconsultoracannabica` — responds to comments and DMs using OpenAI LLM with a cannabis wellness consultant persona. Deployed on Vercel as a Next.js 16 app (App Router). Only the API routes are used; no frontend.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm test` — run all tests (Jest + ts-jest)
- `npx jest path/to/test` — run single test file
- `npx tsc --noEmit` — type-check without emitting

## Architecture

Two webhook flows share one endpoint (`POST /api/instagram/webhook`):

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
Meta webhook → entry.messaging[] → dedup → rate limit →
extract user profile (conditions, meds, cannabis use, gender, name) →
build conversation history → LLM with profile context →
post-process (250 char limit) → output filter →
typing indicator + 5s delay → send reply →
if [WHATSAPP] tag detected: send generic template button card
```

## Key Files

- `src/app/api/instagram/webhook/route.ts` — webhook handler, routes comments and DMs
- `src/lib/llm.ts` — comment reply generation, LLM-based classification via `[category]` format
- `src/lib/dm.ts` — DM reply generation, WhatsApp redirect logic, typing indicator
- `src/lib/dm-history.ts` — per-user conversation history (in-memory, 10 msgs, 1h TTL)
- `src/lib/user-profile.ts` — auto-extracted user profiles (conditions, meds, gender, name, cannabis use)
- `src/lib/instagram.ts` — Graph API v21.0 client (reply, hide, caption, dedup check)
- `src/lib/filters.ts` — input comment filter (spam→hide, risk→ignore, offensive→hater mode)
- `src/lib/output-filter.ts` — banned term validation on LLM output
- `src/lib/post-process.ts` — `postProcess()` for comments (150 chars), `postProcessDm()` for DMs (250 chars)
- `src/lib/constants.ts` — single source for `OWN_USERNAME` and `PROFILE_HANDLE`

## Important Patterns

- **LLM classification**: the model responds as `[category] reply text`. `parseResponse()` in llm.ts extracts both. Categories: zueira, elogio, duvida, desabafo, cultivo, hater, geral.
- **WhatsApp redirect in DMs**: LLM adds `[WHATSAPP]` tag when it detects the person needs personalized help. Code replaces with a generic template button card. Direct regex also catches "zap", "whatsapp", "numero" etc.
- **All in-memory state** (dedup, cooldown, rate limit, DM history, user profiles) resets on Vercel cold start. The `hasAlreadyReplied()` API check protects against duplicate comment replies.
- **Token auth**: all Instagram API calls use `Authorization: Bearer` header, never query string.
- **Username centralized**: `OWN_USERNAME` lives only in `constants.ts`. Prompts use `PROFILE_HANDLE` (interpolated from constants).

## Prompt Guidelines

- Prompts are written in Portuguese with proper accents — the model copies the style.
- Vocabulary rules: always "plantinha/f1/fitinho/uso medicinal", never "maconha/cannabis/weed/erva".
- DM prompt instructs gender-aware treatment: "amiga/querida" for women, "amigo/mano" for men, "você" when unknown.
- Comment prompt requires `[category]` prefix format with engagement hook (question at the end).

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
- Instagram Graph API does NOT support liking comments (endpoint removed from API).
- Instagram Graph API like endpoint for comments doesn't exist — don't try to re-add it.
- Rate limit: 500 replies/hour (Meta limit is 750, margin of safety).
