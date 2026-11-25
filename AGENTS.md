# Agent lanes

Two coding agents share this repo. Claude Code runs in cloud sessions Jerry starts from the Claude app. Grok Bot runs as Cursor cloud agents. Each agent opens a pull request for its work and may merge its own once checks pass (D-078; Jerry, Nov 24: "merge everything through"). Jerry can merge, hold or revert anything.

## Lanes

Claude Code owns the web app, the backend and product features, and ships them.

- Web app: `src/`, `public/`, `index.html`, Vite and Tailwind config (`vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`), root `eslint.config.js`, `vitest.config.ts`, `tsconfig*.json`, `vercel.json`, `components.json`.
- iPhone product code: `mobile/src/`, `mobile/assets/`, `mobile/tsconfig.json`, `mobile/eslint.config.js`.
- Backend and jobs both clients use: `supabase/`, `scripts/`, `api/`, `data/`. Edge function deploys and database migrations.
- Over-the-air app updates (`eas update` to the production channel). Every product change reaches phones this way, so whoever makes the change ships it.
- Product docs: `docs/positioning.md`, `docs/nugget-grading.md`, `docs/legal/`, and in `docs/mobile/`: `PLAN.md`, `STATUS.md`, `PAYMENTS.md`, `REFERENCE_STOCKS_NEWS.md`, `X_TAKES.md`, `proposals/`, `research/`, `design/`.

Grok Bot owns the App Store side and release docs.

- App Store Connect: listing metadata, screenshots, App Privacy answers, age rating, review notes, the submit profile.
- TestFlight: tester groups and the public link.
- Release docs: `docs/mobile/RUNBOOK.md`, `docs/mobile/APP_STORE_COMPLIANCE.md`.

Shared, with a note in the pull request:

- Native builds (`eas build`) and their config, `mobile/eas.json` and `mobile/app.json`. Native iOS settings live in `mobile/app.json` (`expo.ios`, plugins, Info.plist keys). Expo generates `ios/` and `android/` at build time; leave them out of git. Whoever needs a new build (a new native module, a version bump) makes it and adds an In progress line first. A new build changes the runtime fingerprint, so over-the-air updates published before it don't reach it.

`mobile/` holds both product code and build config. The paths above are the boundary.

## Shared files

Pull `main` first. If you edit a shared file, say so in the pull request and keep the other client working.

- `packages/shared/`: odds format, title case, design tokens. Imported by `src/` and `mobile/`.
- Root `package.json`, `package-lock.json`, and `bun.lockb` (web app).
- `mobile/package.json` and `mobile/package-lock.json`. Claude Code adds product libraries with `npx expo install`. Grok Bot changes versions when a build or EAS upgrade needs it.
- `mobile/metro.config.js`: the `@shared` alias. Either agent may edit it.
- `docs/mobile/DECISIONS.md`: append. Leave the other agent's entries as they are. Read `PLAN.md` and `STATUS.md` before app work. If your task changes where things stand, update `STATUS.md` and say so in the pull request.
- `docs/mobile/OWNER_ACTIONS.md`: steps only Jerry can do (accounts, Apple, payments, legal). Read it. Leave that work to him.
- This file: each agent edits only its own In progress lines.
- `mobile/AGENTS.md` is Expo coding guidance. This file is the lane split. `CLAUDE.md` holds the product rules both agents follow.

## Rules

- One branch per agent per task. Claude Code uses `claude/`. Grok Bot uses `grokbot/`.
- Pull `main` before starting.
- Push only your own branch, never the other agent's. Open a pull request. Merge your own once checks pass.
- Stay in your lane. If you must edit the other lane, explain why in the pull request.
- Add an In progress line when you start. Remove it when the pull request is merged or the work stops.
- Secrets stay out of the repo and out of chat.

## In progress

Grok Bot | grokbot/asc-testflight-readiness | App Store compliance, listing, and runbook (docs/mobile/APP_STORE_COMPLIANCE.md, docs/mobile/APP_STORE_LISTING.md, docs/mobile/RUNBOOK.md) | 2026-11-25

One line per item: `Agent | branch | what | YYYY-MM-DD`

## Owner and decisions

- Steps only Jerry can do: `docs/mobile/OWNER_ACTIONS.md`.
- Product and technical decisions: `docs/mobile/DECISIONS.md`.
