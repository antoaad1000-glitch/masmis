# Masmis architecture

## Core domains

### Question Bank

Questions are stored in PostgreSQL through Prisma. Each question has exactly four answer columns and one `correctAnswer` index from 1 to 4. AI-generated questions are `approved=false` until validated in the admin panel.

### Game Runtime

The MVP realtime server keeps active room state in memory for speed:

- room code
- players
- ready state
- current question
- score
- answer submissions

For production scale, move runtime state to Redis and use the Socket.IO Redis adapter.

### AI Generation

The AI layer uses a provider interface:

```ts
provider.generateJson(prompt): Promise<unknown>
```

Current providers:

- Ollama local `/api/generate`
- OpenAI `/v1/responses`

Validation happens before insert:

1. JSON schema validation.
2. Exactly four distinct answers.
3. `correct_answer` between 1 and 4.
4. Duplicate check through normalized question hash.
5. Insert as pending approval.

## Production deployment

- `apps/web` → Vercel
- `apps/realtime` → Railway/Fly/Render/VPS
- PostgreSQL → Neon/Supabase/Railway
- File storage for uploaded avatars → S3/R2/UploadThing
- Redis for room state and Socket.IO adapter → Upstash/Railway Redis
