# StartupOS

**An AI business creation operating system.** Enter a single idea and StartupOS
orchestrates **12 specialized agents** to generate a complete, launch-ready
business ecosystem — brand, logo, website, marketing creatives, pricing,
competitor intelligence, growth plans and a go-to-market launch plan.

Every output is a **real, usable asset** — not placeholder text:

- Downloadable **SVG/PNG logo suite**, color palette and typography system
- A **live, multi-page website** rendered from your brand system
- **Instagram post** and **Facebook ad** creatives (real rendered graphics)
- Ready-to-send **HTML email sequences**
- An **interactive WhatsApp chatbot flow**
- Pricing tiers, competitor SWOT, customer persona, sales funnel
- **30 / 60 / 90-day** growth playbooks and a launch checklist

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

```bash
npm install
npm run dev        # http://localhost:3000
```

Then open **/dashboard/generate** and describe your business.

### Works with zero configuration

StartupOS runs fully offline using its **deterministic engine**, producing real
assets without any API key.

### Optional: live LLM generation

Copy `.env.example` to `.env.local` and add an OpenAI-compatible key to upgrade
copy, naming and strategy to live AI. Visual assets are always generated locally.

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
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Framer Motion · Zod. Projects persist locally in the browser; no database
required.
