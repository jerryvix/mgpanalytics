# Release Runbook

How to build, test and ship the MGP iPhone app. Sections marked **pending** get filled in as the pipeline is set up; each one is completed before the first TestFlight build.

## Accounts and access

| System | Owner account | How the builder gets access |
|---|---|---|
| Apple Developer / App Store Connect | LLC organization account | App Store Connect API key stored in Expo (never in the repo) |
| Expo (EAS) | Business email | Access token via secure form, stored as `EXPO_TOKEN` in the build environment |
| Supabase | Existing project `vwezujtftfccamoduglp` | Access token via secure form |
| Figma | Owner | Owner imports review pages; optional token for comments |

## Environment variables (mobile)

| Name | Where set | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/.env`, EAS env | Same Supabase project as the web app |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/.env`, EAS env | Public anon key (same as web `VITE_SUPABASE_PUBLISHABLE_KEY`) |

## Local development

```sh
cd mobile
npm install
npx expo start
npm run typecheck && npx expo lint
npx expo export --platform ios   # bundles the JS for iOS; a quick check that everything resolves
```

The web app's lint and tests ignore `mobile/`. The app has its own `eslint.config.js`.

## Build and ship to TestFlight (pending)

## Over-the-air update (EAS Update) (pending)

When to use: JavaScript-only fixes that don't change native code or the app's purpose. Anything touching native modules, permissions or app.json native config needs a new store build.

## App Store submission (pending)

Checklist lives in `APP_STORE_COMPLIANCE.md`. Store listing copy must trace to `docs/positioning.md`.

## If App Review rejects

1. Read the rejection and the guideline cited.
2. If it's a code or metadata fix, fix and resubmit; log it in `DECISIONS.md`.
3. If it needs a business decision (pricing, content, legal), raise it to the owner with options.
4. Reply in Resolution Center when a clarification (not a change) resolves it.
