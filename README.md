# StartupOS

**An AI business creation operating system.** Describe your business and StartupOS
orchestrates specialized agents to draft a workspace — brand, website, marketing
creatives, pricing, research-backed competitor notes when search is configured,
growth plans and a launch checklist.

Outputs are **drafts you own and edit**, not finished campaigns or verified market
reports:

- Brand system with palette and typography; **logo images** only when image generation is configured
- Multi-page **website preview** you can publish to a public StartupOS URL or export as static HTML (not third-party hosting)
- **Instagram / Facebook ad copy drafts** and rendered creative SVGs — not live ads
- **Email sequence drafts** — not sent mail
- **In-app WhatsApp-style chatbot** — not a WhatsApp Business integration
- Pricing tiers, persona, funnel, and growth/launch checklists grounded in your inputs
- Competitor / market sections stay **unavailable or provisional** when web search is off or thin

## Architecture

```
User Input
   ↓
Brand → Design → Persona → Competitor → Pricing → Website → SEO
   → Marketing → Email → WhatsApp → Growth → Launch → Publisher
   ↓
Final Business Package
```

- **`src/lib/agents/`** — the 12 agents. Each has a deterministic generator and
  an optional LLM-enhanced path. Outputs are validated with Zod and merged with
  safe defaults so malformed AI output can never crash the pipeline.
- **`src/lib/engine/`** — real asset generators (color science, typography,
  procedural SVG logos, social/ad creatives, industry knowledge base).
- **`src/lib/orchestrator.ts`** — the orchestration engine. Runs agents in
  dependency order, isolates failures per-agent, and streams progress as
  Server-Sent Events.
- **`src/lib/ai/client.ts`** — provider-agnostic, OpenAI-compatible LLM client
  with timeouts, retries and graceful failure (never throws to callers).
- **`src/components/workspace/`** — polished UIs that transform generated data
  into interactive interfaces (no raw JSON).

## Running

Accounts and saved businesses need PostgreSQL and Better Auth. Without
`DATABASE_URL` and `BETTER_AUTH_SECRET` the pages load but sign-in and the
dashboard report the service as unavailable.

```bash
npm install
npm run setup:local # adds missing local DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL to .env.local
npm run db:migrate  # apply migrations to DATABASE_URL (needs the database running, see below)
npm run dev         # http://localhost:3000 — also starts the local database when DATABASE_URL points at it
```

With the local setup, `npm run dev` starts the embedded PostgreSQL itself
when `DATABASE_URL` points at it, and stops it when the dev server stops.
`npm run db:local` in its own terminal still works if you prefer to manage
it yourself, and `npm run dev:next` starts Next.js alone. If you run
`db:migrate` manually, start the database first (or run it once while
`npm run dev` is up).

`setup:local` never changes a value that is already set and never prints values;
to use another database, set `DATABASE_URL` in `.env.local` yourself.
Then create an account, open **/dashboard/generate** and describe your business.
See [docs/RELEASE.md](docs/RELEASE.md) for staging and production releases.

**Password recovery** needs `EMAIL_FROM` and `RESEND_API_KEY` (Resend). Without them the
forgot-password screen explains that recovery is unavailable — it never fakes a send.

**Google Sign-In** needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. In Google Cloud Console
add the redirect URI `{BETTER_AUTH_URL}/api/auth/callback/google` (for local development:
`http://localhost:3000/api/auth/callback/google`). See `.env.example`.

`npm run dev` uses Turbopack. The first visit to each page compiles it, which
takes seconds to a minute on a slow disk; later visits are fast. To judge real
speed, use `npm run build && npm run start`. `npm run dev:webpack` is the
previous webpack dev server.

#### Projects inside OneDrive (or another synced folder)

OneDrive syncs `.next/` (and `.local-db/`) like any other folder. It can lock
files while the dev server writes them, so a page compile hangs, and it can turn
build output into online-only placeholders, so `npm run build` fails with
`EINVAL: invalid argument, readlink '.next/...'`. A dev server can also read a
half-written build file and fail a page with `SyntaxError: Unexpected end of
JSON input`; reload once the compile finishes. Synced folders also make every
file read slower, which is most of the dev server's compile time.
Safest options, best first:

1. Keep the clone outside the synced folder (for example `C:\dev\StartupOS`).
2. Keep the build folders on this device: in Explorer, right-click `.next` and
   `.local-db` and choose **Always keep on this device**, or run
   `attrib +P -U .next /S /D` from the project folder.
3. Pause syncing while you build.

If a build already failed with `readlink`, stop the running server and delete
only the build output (`Remove-Item -Recurse -Force .next` in PowerShell), then
build again. Never delete anything else to work around sync problems.

### Works without AI keys

Without an LLM key StartupOS generates with its **deterministic engine**,
producing real assets without any provider calls.

### Optional: live LLM generation

Copy `.env.example` to `.env.local` and add an OpenAI-compatible key to upgrade
copy, naming and strategy to live AI. The same key generates the logo with the
image model (`OPENAI_IMAGE_MODEL`, default `gpt-image-1`); without a key no
logo is generated and the brand page says so. Logo images usually take most of
the one to two minutes a full generation needs.

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1   # or any compatible provider
OPENAI_MODEL=gpt-4o-mini
```

The platform automatically falls back to the deterministic engine for any agent
if the provider is unavailable, slow, or returns invalid output.

### Real competitor & market research (live web search)

The **Competitor Agent** and **Market Research Agent** use **real web search** —
they never fabricate competitors, websites, statistics or local businesses.
Configure **any one** provider (auto-selected by priority):

```bash
TAVILY_API_KEY=...   # recommended (built for AI search)
# or
SERPER_API_KEY=...   # Google results via serper.dev
# or
BRAVE_API_KEY=...    # Brave Search API
```

Without a search key, these two sections honestly report themselves as
**unavailable** (with setup guidance in-app) rather than inventing data. Every
competitor links to its real discovered website, and every market insight is
shown with its source URLs.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run dev:webpack` | Start the dev server with webpack |
| `npm run setup:local` | Add missing local database and auth settings to `.env.local` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Vitest (uses in-process PGlite with the real migrations) |
| `npm run db:migrate` | Apply Drizzle migrations to `DATABASE_URL` |
| `npm run db:local` | Start an embedded local PostgreSQL for development |

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Framer Motion · Zod · PostgreSQL with Drizzle ORM · Better Auth.
