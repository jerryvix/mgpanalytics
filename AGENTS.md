# Agent lanes

Two coding agents share this repo. Claude Code runs on Jerry's computer. Grok Bot runs as Cursor cloud agents. Jerry merges pull requests.

## Lanes

Claude Code owns the web app and product features.

- Web app: `src/`, `public/`, `index.html`, Vite and Tailwind config (`vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`), root `eslint.config.js`, `vitest.config.ts`, `tsconfig*.json`, `vercel.json`, `components.json`.
- iPhone product code: `mobile/src/`, `mobile/assets/`, `mobile/tsconfig.json`, `mobile/eslint.config.js`.
- Backend and jobs both clients use: `supabase/`, `scripts/`, `api/`, `data/`.
- Product docs: `docs/positioning.md`, `docs/nugget-grading.md`, `docs/legal/`, and in `docs/mobile/`: `PLAN.md`, `STATUS.md`, `PAYMENTS.md`, `REFERENCE_STOCKS_NEWS.md`, `proposals/`, `research/`, `design/`.

Grok Bot owns the iOS build, App Store Connect, TestFlight, and release docs.

- Expo and EAS config: `mobile/eas.json`, `mobile/app.json`.
- Native iOS settings live in `mobile/app.json` (`expo.ios`, plugins, Info.plist keys). Expo generates `ios/` and `android/` at build time. Leave those directories out of git.
- Release docs: `docs/mobile/RUNBOOK.md`, `docs/mobile/APP_STORE_COMPLIANCE.md`.
- App Store Connect and TestFlight: signing, the submit profile, tester groups, and listing metadata. The submit Apple ID is `submit.production.ios.ascAppId` in `mobile/eas.json`.

`mobile/` holds both product code and build config. The paths above are the boundary.

## Shared files

Pull `main` first. If you edit a shared file, say so in the pull request and keep the other client working.

- `packages/shared/`: odds format, title case, design tokens. Imported by `src/` and `mobile/`.
- Root `package.json`, `package-lock.json`, and `bun.lockb` (web app).
- `mobile/package.json` and `mobile/package-lock.json`. Claude Code adds product libraries with `npx expo install`. Grok Bot changes versions when a build or EAS upgrade needs it.
- `mobile/metro.config.js`: the `@shared` alias. Either agent may edit it.
- `docs/mobile/DECISIONS.md`: append. Leave the other agent's entries as they are. Read `PLAN.md` and `STATUS.md` before app work. If your task changes where things stand, update `STATUS.md` and say so in the pull request.
- `docs/mobile/OWNER_ACTIONS.md`: steps only Jerry can do (accounts, Apple, payments, legal). Read it. Leave that work to him.
- This file: each agent edits only its own In progress line.
- `mobile/AGENTS.md` is Expo coding guidance. This file is the lane split.

## Rules

- One branch per agent per task. Claude Code uses `claude/`. Grok Bot uses `grokbot/`.
- Pull `main` before starting.
- Push only your branch. Open a pull request. Jerry merges it into `main`.
- Stay in your lane. If you must edit the other lane, explain why in the pull request.
- Add an In progress line when you start. Remove it when the pull request is merged or the work stops.
- Secrets stay out of the repo and out of chat.

## In progress

None.

One line per item: `Agent | branch | what | YYYY-MM-DD`

## Owner and decisions

- Steps only Jerry can do: `docs/mobile/OWNER_ACTIONS.md`.
- Product and technical decisions: `docs/mobile/DECISIONS.md`.
