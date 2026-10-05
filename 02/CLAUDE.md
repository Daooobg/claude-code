# CLAUDE.md

We are building the app described in @SPEC.MD. Read that file for general architectural tasks or to double-check the exact database structure, tech stack or application architecture.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

Whenever working with any third-party library or something similar, you MUST look up the official documentation to ensure that you are working with up-to-date information.
Use the DocsExplorer subagent for efficient documentation lookup.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This folder is lesson `02` of a course repo (sibling folders like `../01` are earlier, independent snapshots). It is currently a fresh `create-next-app` scaffold; the app to be built is fully described in `SPEC.MD` — a note-taking web app with auth, TipTap rich-text notes stored in SQLite, and public share links. **Read `SPEC.MD` before implementing features**; it defines the schema, file layout, API contracts, and routes.

## Commands

Bun is the package manager and the intended runtime (`bun.lock`).

```bash
bun install
bun dev            # next dev on http://localhost:3000
bun run build      # next build
bun run start      # next start
bun run lint       # eslint (flat config: next core-web-vitals + typescript)
bunx tsc --noEmit  # type-check
```

- The app uses `bun:sqlite`, which only exists under the Bun runtime. Plain `next dev` runs on Node, so once DB code exists run Next with `bun --bun next dev` / `bun --bun next build` (or update the `package.json` scripts accordingly).
- Auth tables are managed by the better-auth CLI: `bun run auth:migrate` (= `bunx --bun auth@latest migrate`; `--bun` is required for `bun:sqlite`). Re-run whenever auth config/plugins change. The app's own `notes` table is created by `bun run db:init` (`scripts/init-db.ts`, idempotent). Run auth migrate first.
- No test framework is configured.

## Stack notes

- Next.js 16 (App Router), React 19, TypeScript strict, path alias `@/*` → project root.
- Tailwind CSS v4 via `@tailwindcss/postcss`; configuration lives in `app/globals.css` (`@import "tailwindcss"` + `@theme`). There is no `tailwind.config.ts` — ignore that part of SPEC §10.
- Env vars (see `.env.example`): `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `DB_PATH` (default `data/app.db`). Prefer `DB_PATH` over the hardcoded path in the SPEC examples.
- Installed: `better-auth`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `zod`. Not yet installed but referenced by the SPEC: `nanoid` (share slugs). TipTap v3's StarterKit already includes inline code and code blocks, so separate `@tiptap/extension-code*` packages aren't needed.

## Target architecture (from SPEC.MD)

- `lib/db.ts` — singleton `bun:sqlite` connection with `PRAGMA foreign_keys = ON`; `query/get/run` helpers. Raw SQL only, no ORM.
- `lib/auth.ts` — `betterAuth({ database: <bun sqlite Database>, emailAndPassword: { enabled: true } })`, sharing the same SQLite file. Handler mounted at `app/api/auth/[...all]/route.ts`; server-side session via `auth.api.getSession({ headers })`. Single custom `/authenticate` page (sign-in + sign-up, email + password only) using the better-auth client.
- `lib/notes.ts` — note repository. Every query except `getNoteByPublicSlug` must filter by `user_id`, and `userId` always comes from the session, never the request.
- API: `/api/notes` (GET list, POST create), `/api/notes/[id]` (GET/PUT/DELETE), `/api/notes/[id]/share` (POST toggle). Return 401 when unauthenticated, 404 for missing or not-owned notes.
- Pages: `/` landing, `/dashboard` and `/notes/[id]` (auth-checked on the server), `/p/[slug]` public read-only view.

## Data conventions

- better-auth owns `user`, `session`, `account`, `verification` (camelCase columns, TEXT ids). Never create or alter them by hand; add user fields via `user.additionalFields` and re-run migrate. Always quote `"user"` in raw SQL.
- The app-owned `notes` table uses snake_case columns (`user_id`, `content_json`, `is_public`, `public_slug`, ...); map them to the camelCase `Note` type in the repository layer.
- Note content is TipTap JSON stored as `JSON.stringify(doc)` in `content_json`; render it only through TipTap (`editable: false` for public views), never via `dangerouslySetInnerHTML`.
- Sharing: enabling generates a random slug (16+ chars) if none exists; disabling sets `is_public = 0` and `public_slug = NULL`.
