# MGP iPhone app

Expo (SDK 58) + expo-router app. Plan, decisions and status live in `../docs/mobile/`; start with `../docs/mobile/PLAN.md`.

## Run it

```sh
cd mobile
npm install
npx expo start        # scan the QR code with a development build, or press w for web
npm run typecheck
npx expo lint
```

Native modules not in Expo Go (push notifications, Sign in with Apple) need a development build: `npx eas-cli@latest build --profile development`.

## Layout

```
src/app/            routes (one file per screen; _layout.tsx sets up tabs)
src/components/     shared UI (ScreenShell, ThemedText, AppTabs)
src/constants/      theme, built from ../packages/shared/design-tokens/tokens.json
src/hooks/          color scheme and theme hooks
```

Shared code from `../packages/shared` is imported with the `@shared/` alias (see `tsconfig.json` and `metro.config.js`).

## Rules

- Colors, type sizes and radii come from the shared tokens. Don't hard-code hex values in screens.
- Screens still showing the "In development" box must not ship (App Review 2.1).
- Use `npx expo install <pkg>` to add packages so versions match the SDK.
