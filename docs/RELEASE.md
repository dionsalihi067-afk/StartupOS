# Release runbook

The repository holds no hosting configuration, but the GitHub repository is connected to Vercel through the Vercel GitHub app:

- **Pushing to `main` creates a Production deployment.** Do not push untested work to `main`.
- **Pushing any other branch creates a Preview deployment.** Use one as staging, with Preview-scoped environment variables pointing at a separate staging database.

The steps below also apply to any other Node.js host that runs `npm run build` and `npm run start`.

## Required configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL 14+. Pooled (transaction-mode) URLs are supported. |
| `BETTER_AUTH_SECRET` | yes | At least 32 random characters. Different per environment; never reused from local development. |
| `BETTER_AUTH_URL` | yes in production | Public base URL, e.g. `https://app.example.com`. A production server refuses to start without it. On a Preview deployment, set it to the branch URL (see below). |
| `APP_ORIGIN` | no | Origin for published-site links; defaults to `BETTER_AUTH_URL`. Must include `https://` if set. |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_IMAGE_MODEL` | no | Without a key the deterministic engine is used and no logo images are generated. |
| `TAVILY_API_KEY` / `SERPER_API_KEY` / `BRAVE_API_KEY` | no | Without one, research sections report "unavailable". |
| `RATE_LIMIT_*_PER_HOUR` | no | 1–10000; invalid values fall back to defaults. Limits cannot be disabled. |
| `APP_VERSION` | no | Reported by `/api/health` so you can confirm which build is serving. |

A production server refuses to start when a required value is unset or invalid, and lists only the variable names. The build itself does not need database or auth values.

## Staging on a Vercel Preview

Vercel runs Preview deployments with `NODE_ENV=production`, so the production checks above apply to staging too.

1. Create a staging database that is separate from production, and apply migrations to it (release procedure, steps 2–3).
2. In Vercel → Settings → Environment Variables, add `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `APP_ORIGIN` for the **Preview** environment only, scoped to the staging branch (for example `staging`). Never select Production for these values, and never reuse the production secret.
3. Set `BETTER_AUTH_URL` and `APP_ORIGIN` to the branch URL Vercel assigns, `https://<project>-git-<branch>-<team>.vercel.app`. It stays the same across pushes to that branch, unlike the per-deployment URL.
4. Push the staging branch. If Deployment Protection is on, sign in to Vercel in the browser before opening the Preview, and use a protection bypass token for scripted checks.

## Release procedure

1. **Back up the target database** with your provider's snapshot or `pg_dump --format=custom "$DATABASE_URL" > startupos-<date>.dump`. Confirm the backup exists and is non-empty before continuing.
2. **Identify the target database.** Before migrating, run:
   ```bash
   psql "$DATABASE_URL" -c "select current_database(), inet_server_addr(), now()"
   psql "$DATABASE_URL" -c "select id, created_at from drizzle.__drizzle_migrations order by created_at"
   ```
   Check that the host and database name are the intended environment (staging or production) and note which migrations are already applied.
3. **Apply migrations** from the release commit, with `DATABASE_URL` set explicitly in the same shell you used for step 2:
   ```bash
   DATABASE_URL='<staging url>' npm run db:migrate          # bash
   ```
   ```powershell
   $env:DATABASE_URL = '<staging url>'; npm run db:migrate  # PowerShell
   ```
   `drizzle.config.ts` loads `.env` and `.env.local` when `DATABASE_URL` is not already set, so running the command without it migrates whatever database those local files name. Never keep a production URL in a local env file. Migrations are additive (`CREATE TABLE`, new columns); none drop data.
4. **Deploy** the same commit with `npm run build` and `npm run start`.
5. **Verify:**
   - `GET /api/health` returns `200` with `"database":"ok"` and `"migrations":"current"`, and `version` matches the release.
   - Sign in, open a saved business, edit the brand and reload.
   - Publish a test site, open `/s/<slug>` and a nested page, then unpublish it.
   - Requests over the limit return `429` with `Retry-After`.

`/api/health` returns `503` with `"migrations":"pending"` when the build is newer than the database schema. Do not route traffic to it until migrations are applied.

## Rollback

- **Application:** redeploy the previous commit. Migrations are additive, so the previous build runs against the newer schema.
- **Database:** restore the step-1 backup only if data itself is damaged. Restoring discards writes made since the backup.

## Operational notes

- Server errors are logged as `[scope] Name code message` with messages truncated to 200 characters. Request bodies, packages and credentials are not logged.
- Generations interrupted by a restart are marked `failed` (`interrupted`) the next time their owner lists or opens a business. Users can retry them.
- Rate-limit counters live in the `request_quota` table, so every instance sharing the database shares the limits. If the database is unreachable, rate-limited operations return `503` rather than running unmetered.
- Generated logos are stored in `generated_asset` and served by `/api/assets/<id>`. The owner can always load them; anyone else only while the business's **live** published website uses that image. Everything else returns the same `404` as an unknown id. Public copies are cached for a day, so an unpublished logo may stay in browser or CDN caches for up to 24 hours.
- After a successful section regeneration, images older than 15 minutes that no stored business package and no published snapshot (live or unpublished) mention are deleted. A failed logo regeneration keeps the previous logo.

## Staging checklist

Run against the staging deployment, not production:

1. `/api/health` returns `200`, `"migrations":"current"`, and the expected `version`.
2. Two test accounts: account B gets `404` for account A's business (`/api/businesses/<id>`), publish route and unpublished logo URL.
3. Create a business with a budget, one with no budget, and one with a budget of `0`. The financial model shows "fits" (or an explicit shortfall), "no budget given", and for the zero budget an explicit shortfall unless the plan has no startup costs. No over-budget plan may show a negative "left over" amount.
4. Regenerate the logo; the new logo appears and the previous one still loads on a site published before the regeneration.
5. Publish, open `/s/<slug>` signed out, unpublish, and confirm the page returns `404`.
6. Exceed a rate limit (or lower `RATE_LIMIT_REGENERATE_PER_HOUR` on staging) and confirm `429` with `Retry-After`.

## Known limitations

- Brand renames propagate to the website's site name; a changed slogan does not update website copy until the website is regenerated.
- Sales channels are opt-in: plans only use the channels the owner selected. There is no separate "never use" list.
- Generated emails, WhatsApp flows and ads are drafts. Nothing is connected to an email, messaging or ad account.
- Financial figures are AI-proposed planning assumptions computed deterministically; they are not quotes, and no currency conversion is performed.
- An image stored by a generation that failed before saving its package is kept until the business is deleted.
