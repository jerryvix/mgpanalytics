# Release Runbook

How to build, test and ship the MGP iPhone app. Sections marked **pending** get filled in as the pipeline is set up; each one is completed before the first TestFlight build.

## Accounts and access

| System | Owner account | How the builder gets access |
|---|---|---|
| Apple Developer / App Store Connect | Team 4939734628, app Apple ID 6838568637, bundle `com.mgpanalytics.app`. The LLC is not filed (D-110). Confirm Entity Type under Membership details. An Individual account can submit this app (`APP_STORE_COMPLIANCE.md`) | App Store Connect API key stored in Expo (never in the repo) |
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

## Build and ship to TestFlight

Signing is set up (D-083): Expo holds the distribution certificate and provisioning profile, and the App Store Connect key on Expo is assigned to this app for uploads. Build numbers auto-increment on Expo.

```sh
cd mobile
EXPO_TOKEN=proxy-injected EXPO_APPLE_TEAM_ID=4939734628 npx -y eas-cli@latest build -p ios --profile production --non-interactive --no-wait --auto-submit
```

The build takes about 5 to 20 minutes, the upload runs on Expo's servers when it finishes, and Apple processes the build in about 5 to 15 minutes more. The internal TestFlight group "Team (Expo)" gets every build. Expo is meant to add every App Store Connect admin to it, but on the first run it added no one; the owner was added by hand on Nov 24. When someone new joins App Store Connect, add them in TestFlight > Team (Expo) > Testers.

If a build fails: `eas build:view <id> --json` gives `logFiles`; download with `curl --compressed` (the file is newline-delimited JSON with a `phase` per line).

- The release bundle step (`EAGER_BUNDLE`) runs `npx expo export:embed --eager --platform ios --dev false`. Run that locally first to catch bundle errors in seconds.
- Keep `web.output` at `single`. `server` makes that step load the app in Node, where the Supabase client's storage crashes.

## Over-the-air update (EAS Update)

When to use: JavaScript-only fixes that don't change native code or the app's purpose. Anything touching native modules, permissions, or `app.json` native config needs a new store build. A new build changes the runtime fingerprint, so an update published from a different fingerprint does not reach the previous build.

Runtime policy is `fingerprint` (`mobile/app.json`, `runtimeVersion.policy`). `mobile/eas.json` does not set its own runtime, so this policy covers every profile. Store and TestFlight builds use the `production` channel (`build.production.channel` in `eas.json`). The release task names the store build on this policy as build 6. Git does not store the EAS build number or the fingerprint hash. Publish a production update from a tree whose native fingerprint matches that build, or the phone will not apply it.

Checked 2026-11-25 against `mobile/app.json`, `mobile/eas.json`, `mobile/src/lib/app-updates.ts`, and `mobile/src/app/_layout.tsx` (`useAppUpdates()`).

What the previous runbook said, and what the files say now:

- It said TestFlight builds use runtime `exposdk:58.0.0`. `app.json` says `fingerprint`. The `exposdk` runtime was the Expo Go policy. It is no longer the store policy.
- It said testers get the update the second time they open the app. D-108 and `app-updates.ts` apply an update on the open that downloads it, when the download finishes within 10 seconds. Coming back after a minute or more away counts as opening again. An update that finishes later, while the app is in use, waits for the next return. Off in development and on the web preview (`ON` in `app-updates.ts`).

```sh
cd mobile
EXPO_TOKEN=proxy-injected npx -y eas-cli@latest update --channel production --environment production --message "<what changed>" --non-interactive
```

## App Store submission (pending)

Checklist lives in `APP_STORE_COMPLIANCE.md`. Paste-ready listing, age rating, privacy answers, review notes, TestFlight text, and the steps only Jerry can take are in `APP_STORE_LISTING.md`. Store listing copy must trace to `docs/positioning.md`.

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

## Preview the app on a phone

TestFlight is the preview that matches the store runtime. Build 6 (and any later store build on the same fingerprint) takes `production` channel updates, and those updates apply on the first open as described above.

Expo Go does not match this project anymore. `app.json` uses the `fingerprint` runtime policy, and Expo Go only loads an `exposdk` runtime. The old preview URL `exp://u.expo.dev/e2931e03-8ca1-450e-a95e-82cafa55c651?channel-name=preview&runtime-version=exposdk:58.0.0` and `docs/mobile/preview-qr.png` were for the `sdkVersion` policy. They do not load a fingerprint update. The `preview` channel in `eas.json` is still there, for an internal build made with the `preview` profile, and that build's fingerprint has to match the update. It is not an Expo Go channel.

```bash
cd mobile && EXPO_TOKEN=proxy-injected npx -y eas-cli@latest update --channel preview --environment preview --platform ios --message "what changed" --non-interactive
```
