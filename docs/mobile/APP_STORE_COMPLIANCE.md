# App Store Compliance Checklist

Rules App Review checks that apply to MGP, and how we meet each one. Guideline numbers refer to Apple's App Review Guidelines; re-check the live guidelines before each submission because they change.

Status: `todo` / `in progress` / `done`.

## Will be rejected if missing

| Requirement | Guideline | MGP today | Plan | Status |
|---|---|---|---|---|
| Not a website wrapper; real app functionality | 4.2 | n/a | Native Expo screens, push alerts, native sign-in | todo |
| Sign in with Apple (or equivalent private login) when Google login is offered | 4.8 | Google + email only | Add Sign in with Apple via Supabase `signInWithIdToken` | todo |
| Let people use non-account features without logging in | 5.1.1(v) | Website requires login for everything | Guest browsing (D-014) | todo |
| In-app account deletion | 5.1.1(v) | Not built | Profile, then Delete account, then an edge function deletes auth user + personal rows | todo |
| Privacy policy URL (in app and in listing) | 5.1.1(i) | None exists | Draft, owner approves, host at `mgp-analytics.com/privacy` | todo |
| Support URL | 1.5 | None exists | `mgp-analytics.com/support` with contact email | todo |
| Demo account for App Review | 2.1 | n/a | Dedicated reviewer account with onboarding completed; credentials go only into App Store Connect | todo |
| Disclose and get consent before sending personal data to a third-party AI | 5.1.2(i) | Chat sends questions to Anthropic with no notice | One-time consent screen before first Analyst use; named in privacy policy | todo |
| No placeholder or "coming soon" screens | 2.1 | Web has four "Coming Very Soon" pages (Line Movement, Trends, Player Props, Live Edges) | App ships only finished screens; unbuilt features are absent, not teased | todo |
| Accurate metadata, no claims the app can't back | 2.3.1 | Landing page mentions Kalshi and "real time" | Store listing copy must trace to `docs/positioning.md`; no Kalshi, no "real time" for odds | todo |
| Privacy nutrition labels match actual collection | 5.1.2 | n/a | Fill from the SDK list at submission time | todo |

## Betting-related content

| Requirement | Guideline | Plan | Status |
|---|---|---|---|
| Submitted by a legal entity (regulated field) | 5.1.1(ix) | Organization developer account (D-001) | in progress |
| Age rating reflects gambling references | Age rating | Answer the questionnaire honestly; expect 18+ (Stocks.News is 18+) | todo |
| No real-money wagering in app; no in-app purchase tied to wagering | 5.3 | MGP does not take bets. No sportsbook links in v1 (D-008) | done |
| Responsible gambling messaging | Best practice | 1-800-GAMBLER and "for entertainment and information" in Profile and onboarding; reuse `EntertainmentDisclaimer` copy | todo |
| No "picks" or guaranteed-win language | 2.3, 5.3 | Analyst guardrails already forbid prescriptive language; keep store copy descriptive | done |

## Intellectual property and data

| Item | Risk | Plan |
|---|---|---|
| Team logos (ESPN CDN, 78 references) | League trademarks; hotlinked | Not in icon, screenshots or listing (D-009). Before charging money: license, or switch to team color badges with abbreviations |
| Player headshots (e.g. NBA players list) | Photo rights belong to leagues and agencies | Same rule as logos: not in store marketing; review before charging money |
| ESPN unofficial endpoints, MLB StatsAPI | Terms restrict commercial use | Acceptable while free; must be resolved before a paywall goes live |
| The Odds API, BallDontLie, Sportradar | Commercial terms vary by plan | Confirm plan tiers allow commercial redistribution before a paywall |
| Stocks.News look and feel | Copycat rejection (4.1) and legal letters | Adopt patterns, not visuals or artwork (see `REFERENCE_STOCKS_NEWS.md`) |

## Age-verification laws

Several US states have passed app-store age-verification laws (Texas first). Before submission, check which are in force and whether Apple's Declared Age Range API must be used. Owner: builder. Status: todo.

## Payments (v1.1, when the paywall turns on)

- Digital subscriptions sold inside the app must use Apple in-app purchase (3.1.1). Check current US storefront rules on external purchase links before deciding the web vs in-app pricing approach.
- Apple Small Business Program: 15% commission under $1M/year. Enroll when the paywall goes live.
- Needs the Paid Apps agreement, banking and tax forms in App Store Connect (owner action).
- A subscriber on the web and in the app must see the same entitlement (one source of truth in Supabase).
