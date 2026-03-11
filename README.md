# Snoop

Snoop is a TypeScript-powered CLI + backend that explains npm/PyPI packages in plain English before install.

## Features

- Plain-English package summaries
- Dependency count and approximate install size
- Maintenance health and basic risk signals
- License type + risk flag
- Suggested alternatives
- Optional install confirmation flow

## Monorepo Layout

- `backend/` - Hono API (`POST /analyze`)
- `cli/` - `snoop` command-line client

## Backend Setup

1. `cd backend`
2. `npm install`
3. `cp .env.example .env` and set:
   - `ANTHROPIC_API_KEY`
   - `MODEL` (optional, defaults to `claude-haiku-4-5-20251001`)
   - `DATABASE_URL` (optional, uses in-memory cache if omitted)
   - `GITHUB_TOKEN` (optional)
4. `npm run dev`

The backend runs at `http://localhost:8787` by default.

## CLI Setup

1. `cd cli`
2. `npm install`
3. `npm run build`
4. `npm link`

## Usage

- `snoop axios`
- `snoop pandas --ecosystem pip`
- `snoop axios --json`
- `snoop axios --no-install`

Set a custom backend URL with `SNOOP_API_URL`, for example:

- PowerShell: `$env:SNOOP_API_URL = "http://localhost:8787"`
- CMD: `set SNOOP_API_URL=http://localhost:8787`

## Notes

- Node.js 18+ required.
- The CLI never talks to Anthropic directly; only the backend uses `ANTHROPIC_API_KEY`.
- Rate limit middleware enforces 10 requests/day per IP for the free tier.
