# MGP Analytics

Sports analytics platform covering NFL, NBA, NCAAB, NCAAF, and MLB. Provides player stats, odds tracking with line-movement detection, and an AI-powered analyst chat.

## Tech Stack

- **Frontend** — React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts
- **Backend** — Supabase (Postgres, Auth, Edge Functions)
- **Hosting** — Vercel (frontend), Supabase (API + DB)
- **AI** — Google Gemini (analyst chat)

## Local Development

Prerequisites: Node.js 18+ and npm.

```sh
git clone https://github.com/your-org/mgpanalytics.git
cd mgpanalytics
npm install
npm run dev        # starts dev server on http://localhost:8080
```

### Environment Variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://vwezujtftfccamoduglp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

Edge functions use Supabase project secrets (set via `supabase secrets set`):

| Secret | Purpose |
|--------|---------|
| `THE_ODDS_API_KEY` | The Odds API — odds snapshots |
| `GEMINI_API_KEY` | Google Gemini — analyst chat |
| `SPORTRADAR_API_KEY` | Sportradar — player/game data |
| `BALLDONTLIE_API_KEY` | BallDontLie — NBA/NFL stats |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm test` | Run tests (vitest) |

## Supabase Edge Functions

Sync functions are triggered by an admin user from the dashboard. The project includes functions for:

- Game syncing — `sync-nfl-games`, `sync-nba-games`, `sync-ncaab-games`, `sync-ncaaf-games`, `sync-mlb-games`
- Player syncing — `sync-nfl-players`, `sync-nba-players`, `sync-ncaab-players`
- Odds — `sync-nba-odds`, `sync-odds-snapshot`
- Props — `sync-player-props` (The Odds API, NFL + NBA)
- Stats — `sync-nfl-season-stats`, `sync-nba-stats`, `sync-nba-game-logs`
- AI — `gemini-chat`, `analyst-query`
- Utilities — `balldontlie`, `sportradar`, `search-nfl-players`, `nfl-slate-leaders`

## Deployment

- **Frontend**: Pushes to `main` auto-deploy to Vercel. `vercel.json` handles SPA routing rewrites.
- **Edge Functions**: Deploy with `supabase functions deploy <function-name>` or deploy all with `supabase functions deploy`.

## Project Structure

```
src/
  components/   # UI components
  contexts/     # React contexts (auth, theme)
  hooks/        # Custom hooks
  pages/        # Route pages
  services/     # API service layers
  types/        # TypeScript types
  utils/        # Helpers
supabase/
  functions/    # Deno edge functions
  config.toml   # Supabase CLI config
```
