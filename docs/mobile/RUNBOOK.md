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

## Deploying a Supabase edge function (cloud sessions)

The "mgpanalytics" cloud environment holds the owner's Supabase access token as a network secret for `api.supabase.com` (D-054). The CLI needs some token in its environment to start, so pass a placeholder built at run time (a literal one in the repo trips GitHub's secret scanning); the proxy replaces it on the way out:

```sh
SUPABASE_ACCESS_TOKEN="sbp_$(printf '0%.0s' $(seq 40))" npx supabase functions deploy <name> --project-ref vwezujtftfccamoduglp --use-api
```

On your own machine, run `npx supabase login` once instead and drop the placeholder. Deploy only from a branch whose tests pass; the functions serve the live website.

## Preview the app on a phone (Expo Go)

The app runs in Expo Go (free on the App Store) before any TestFlight build. Each `eas update` to the `preview` channel shows up the next time Expo Go opens the app.

```bash
cd mobile && EXPO_TOKEN=proxy-injected npx -y eas-cli@latest update --channel preview --environment preview --platform ios --message "what changed" --non-interactive
```

Open on the phone: install Expo Go, then scan `docs/mobile/preview-qr.png` with the iPhone camera, or open `exp://u.expo.dev/e2931e03-8ca1-450e-a95e-82cafa55c651?channel-name=preview&runtime-version=exposdk:58.0.0`. The runtime version is `exposdk:58.0.0` because `app.json` uses the `sdkVersion` runtime policy, which is what Expo Go loads. Switch to the `fingerprint` policy once TestFlight builds replace Expo Go.
