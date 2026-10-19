# QuizLive — AI-Powered Live Quiz Platform

A production-quality, full-stack live quiz platform combining AI quiz generation (Claude), real-time multiplayer (Socket.IO), and a polished educator + student interface.

## Architecture

```
Next.js 14 (App Router)  ←→  Custom Node.js server (Socket.IO)
         ↕                              ↕
  API Routes (REST)              Real-time events
         ↕                              ↕
    better-sqlite3 (SQLite)  ←  Server-authoritative scoring
         ↕
    Anthropic Claude API (server-side only)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Real-time | Socket.IO 4 (WebSocket + polling fallback) |
| Auth | NextAuth.js v4 (Credentials) |
| Database | SQLite via better-sqlite3 (swap to PostgreSQL trivially) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Passwords | bcryptjs (12 rounds) |

## Database Schema

```
users           → educators with hashed passwords
quizzes         → created by users, contains JSON settings
questions       → ordered, stores options as JSON array
quiz_sessions   → live instances with unique join codes
participants    → students in a session (no account needed)
answers         → immutable per-participant-per-question
prizes          → optional rewards by rank
```

## API Routes

### Auth
- `POST /api/auth/register` — Create educator account
- `POST /api/auth/[...nextauth]` — Sign in / sign out / session

### Quizzes (educator only)
- `GET    /api/quiz` — List my quizzes
- `POST   /api/quiz` — Create quiz with questions
- `GET    /api/quiz/[quizId]` — Get quiz with questions
- `PUT    /api/quiz/[quizId]` — Update quiz
- `DELETE /api/quiz/[quizId]` — Delete quiz

### AI Generation (educator only, server-side)
- `POST /api/ai/generate` — Generate quiz from natural language prompt

### Sessions
- `POST /api/session` — Create live session (returns joinCode)
- `GET  /api/session` — List my sessions
- `GET  /api/session/[sessionId]` — Session detail (host only)
- `POST /api/session/join` — Student joins with code + nickname
- `GET  /api/session/[sessionId]/results` — Final results

## Real-time Events (Socket.IO)

### Client → Server
| Event | Payload | Who |
|-------|---------|-----|
| `host:join` | `{sessionId, hostId}` | Host |
| `host:start` | `{sessionId}` | Host |
| `host:next` | `{sessionId}` | Host |
| `host:pause` | `{sessionId}` | Host |
| `host:resume` | `{sessionId}` | Host |
| `host:end` | `{sessionId}` | Host |
| `participant:join` | `{sessionId, participantId}` | Student |
| `participant:answer` | `{sessionId, participantId, questionId, selectedOption}` | Student |

### Server → Client
| Event | Who receives | Payload |
|-------|-------------|---------|
| `quiz:started` | Everyone | `{sessionId}` |
| `question:started` | Everyone | `{questionIndex, question (no answer), timeLimit, startedAt}` |
| `answer:count` | Host | `{answered, total}` |
| `answer:accepted` | Submitting student | `{isCorrect, pointsEarned, timeTaken}` |
| `answer:rejected` | Submitting student | `{reason}` |
| `question:ended` | Everyone | `{correctAnswer, explanation, distribution, leaderboard}` |
| `participant:result` | Individual student | `{isCorrect, pointsEarned, totalScore, rank, correctAnswer, explanation}` |
| `quiz:paused` / `quiz:resumed` | Everyone | — |
| `quiz:ended` | Everyone | `{leaderboard, prizes}` |
| `participant:joined` | Host | `{participant, totalCount}` |
| `participant:left` | Host | `{participantId}` |

## Security

- ✅ Correct answers never sent to clients before question ends
- ✅ Scores computed server-side only — client input is just `selectedOption`
- ✅ Duplicate submissions blocked (in-memory Set + DB UNIQUE constraint)
- ✅ Late submissions rejected (timer + grace period)
- ✅ Host actions verified by `socket.data.role` + session ownership
- ✅ Student join APIs have no auth — just game code + nickname
- ✅ Educator APIs require NextAuth session
- ✅ AI API key never exposed to frontend (server-only route)
- ✅ Passwords hashed with bcrypt (12 rounds)
- ✅ All inputs validated and sanitized server-side

## Scoring Algorithm

```
Correct answer:
  score = basePoints + speedBonus
  speedBonus = floor(basePoints × 0.5 × (1 - timeTaken / timeLimit))
  Max score = basePoints × 1.5 (answered instantly)
  Min score = basePoints (answered at last second)

Wrong answer:
  score = 0  (or -negativePoints if negative marking enabled)

Tiebreaking:
  1. Higher score wins
  2. More correct answers wins
  3. Earlier join time wins
```

## Setup

### Prerequisites
- Node.js 18+
- An Anthropic API key (for quiz generation)

### Install

```bash
cd ai-quiz-builder
npm install
```

### Configure

Edit `.env.local`:
```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="generate-a-32-char-random-string"
NEXTAUTH_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."
```

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run (Development)

```bash
# Option 1: Use Next.js built-in dev server (no real-time)
npm run dev-next

# Option 2: Use custom server with Socket.IO (full real-time)
node_modules/.bin/ts-node --project tsconfig.server.json server.ts
```

### Build & Run (Production)

```bash
npm run build
# Then run the custom server (compiles server.ts to JS first)
```

## Testing Real-time (Manual)

1. Start the server
2. Register as an educator at `/register`
3. Create a quiz at `/dashboard/quiz/new`
4. Click "Launch" — note the 6-letter join code
5. Open 2–3 new browser windows/tabs
6. Go to `/join` in each, enter the same code with different nicknames
7. Back in the host window, click "Start Quiz"
8. Watch questions appear simultaneously in all student windows
9. Submit answers from student windows — watch the count update in host
10. Observe the leaderboard update after each question

## Known Limitations

- SQLite is single-writer; for 500+ concurrent users, switch to PostgreSQL + connection pooling
- Socket.IO runs in the same Node.js process; for massive scale, use Redis adapter for Socket.IO
- No rate limiting on join or answer endpoints (add express-rate-limit in production)
- Session reconnection requires `sessionStorage` (works in same browser, not across devices)
- No email verification for educator accounts

## Recommended Next Steps

1. **PostgreSQL** — Replace SQLite with Postgres for production scale
2. **Redis adapter** — `@socket.io/redis-adapter` for multi-process Socket.IO
3. **Rate limiting** — Per-IP on `/api/session/join` and `/api/ai/generate`
4. **Image questions** — Upload images to S3, add `imageUrl` field to questions
5. **Multiple-select** — Extend question type handling (schema supports it already)
6. **Analytics dashboard** — Per-question accuracy rates, time distribution charts
7. **Export results** — CSV export of participant scores and answers
8. **Mobile PWA** — Add service worker for offline resilience
