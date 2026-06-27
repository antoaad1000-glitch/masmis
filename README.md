# Masmis

Masmis is a multiplayer trivia game for French culture and French citizenship preparation.

This starter is a scalable monorepo:

- `apps/web`: Next.js + React + Tailwind frontend, REST API routes, admin UI.
- `apps/realtime`: Socket.IO realtime game server.
- `packages/db`: Prisma schema and database client.
- `packages/shared`: shared TypeScript types and scoring logic.
- `packages/ai`: AI provider abstraction for Ollama now and OpenAI later.
- `data`: official source-question extraction from the provided civic exam PDF.

## Important deployment note

Vercel is excellent for `apps/web`, but persistent Socket.IO servers are not a good fit for Vercel serverless functions. Deploy the realtime server separately on Railway, Fly.io, Render, a VPS, or replace it with Ably/Pusher/Supabase Realtime later. Keep `NEXT_PUBLIC_SOCKET_URL` pointing to the deployed realtime server.

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open:

- Web app: http://localhost:3000
- Realtime server: http://localhost:4000/health
- Admin panel: http://localhost:3000/admin

## Ollama setup

Install at least one French-capable model, for example:

```bash
ollama pull mistral
```

Then generate pending questions from the official source prompts:

```bash
pnpm ai:generate -- --limit 20
```

Generated questions are inserted with `approved=false`, so they appear in the admin panel before being playable.

## Environment variables

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/masmis?schema=public"
NEXT_PUBLIC_SOCKET_URL="http://localhost:4000"
ADMIN_SECRET="change-me"
AI_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="mistral"
```

## MVP roadmap

1. Database, Prisma schema, seed data.
2. Realtime room lifecycle: create, join, ready, start game.
3. Question delivery, timer, answer submission, score calculation.
4. End-game ranking and stats.
5. Admin question approval/editing.
6. AI generation from official PDF prompts.
7. Production hardening: Redis adapter for Socket.IO, persistent game sessions, accounts.


## Included 500-question bank

This ZIP includes the 10 generated batches in:

```txt
data/question-bank/
```

To import them as pending questions for admin review:

```powershell
pnpm import:questions
```

To import them directly as approved for local testing:

```powershell
pnpm import:questions:approve
```

Then open:

```txt
http://localhost:3000/admin
```

The original source documents are included in:

```txt
data/sources/
```
