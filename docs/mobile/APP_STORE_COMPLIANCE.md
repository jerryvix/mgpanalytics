# App Store Compliance Checklist

Rules App Review checks that apply to MGP, and how we meet each one. Guideline numbers refer to Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Re-check the live guidelines before each submission because they change.

Status: `todo` / `in progress` / `done`.

**Last checked:** 2026-11-25, against the app code on `main` and the guidelines page fetched that day. Listing text, age rating answers, and privacy label answers are in `APP_STORE_LISTING.md`. Pasting them into App Store Connect is still open.

App record: Apple ID 6838568637, bundle `com.mgpanalytics.app`. Privacy Policy `https://mgp-analytics.com/privacy`, Terms `https://mgp-analytics.com/terms`, Support `https://mgp-analytics.com/support`, email support@mgp-analytics.com (D-110). The LLC is not filed. The policies name the operator "MGP Analytics".

## Will be rejected if missing

| Requirement | Guideline | MGP today | Plan | Status |
|---|---|---|---|---|
| Not a website wrapper; real app functionality | 4.2 | Native screens: Today, Games, Pulse, Analyst, Profile, sign-in, welcome (`mobile/src/app/`). No WebView of the site | Ship those screens | done |
| Sign in with Apple when a third-party login is offered | 4.8 | Email and password only (`mobile/src/app/sign-in.tsx`). No Google, Apple, or other social button. A line tells website Google users to set a password with Forgot Password | Not required. See below | done |
| Let people use non-account features without logging in | 5.1.1(v) | Every install gets an anonymous guest session and can browse. The Analyst, History, and Delete Account need an account | Guest browsing (D-014, D-103) | done |
| In-app account deletion that deletes the account on the server | 5.1.1(v) | Profile > Delete Account, two confirms, calls `delete-account`, then signs out locally | Keep it | done |
| Privacy policy URL in the app and in the listing | 5.1.1(i) | Profile opens `https://mgp-analytics.com/privacy`. The page is live (D-110) | Paste the same URL in App Store Connect (`APP_STORE_LISTING.md`) | in progress |
| Support URL | 1.5 | Profile emails support@mgp-analytics.com. The support page is live and shows that address | Paste `https://mgp-analytics.com/support` in App Store Connect | in progress |
| Demo account for App Review | 2.1 | Not created | Jerry creates it and pastes the credentials into App Store Connect only. Do not invent them here | todo |
| Disclose and get consent before sending personal data to a third-party AI | 5.1.2(i) | One-time notice before the first Analyst question, button Got It. The privacy policy names Anthropic | Keep the notice | done |
| No placeholder or "coming soon" screens | 2.1 | No coming-soon copy under `mobile/src/`. Unbuilt sports are absent. Today says "No NFL, college football or NBA games today" when the board is empty | Ship only finished screens | done |
| Accurate metadata, no claims the app can't back | 2.3.1 | Store copy is drafted in `APP_STORE_LISTING.md` and traced to `docs/positioning.md`. No Kalshi. Odds are not called real time | Paste that copy | in progress |
| Privacy nutrition labels match actual collection | 5.1.2 | Answers are in `APP_STORE_LISTING.md`, from the privacy policy and the code, using Apple's definition of collected | Enter them on App Privacy | in progress |

### Sign in with Apple (4.8)

Fetched 2026-11-25 from the guidelines, section 4.8:

> Apps that use a third-party or social login service (such as Facebook Login, Google Sign-In, Log in with X, Sign In with LinkedIn, Login with Amazon, or WeChat Login) to set up or authenticate the user’s primary account with the app must also offer as an equivalent option another login service with the following features:

The same section says another login service is not required if:

> Your app exclusively uses your company’s own account setup and sign-in systems.

The iPhone app uses that exception. Sign-in is `signInWithPassword` and `signUp` / `updateUser` only (`mobile/src/app/sign-in.tsx`). There is no `signInWithOAuth`, `signInWithIdToken`, or Google button under `mobile/src/`. Google sign-in is website only (privacy policy, "Your Account"). People who made a website account with Google set an app password through Forgot Password. That is the company's own password, not a Google login in the app.

Sign in with Apple is not required for this submission. Add it later only if the app grows a Google, X, or other social button.

### Account deletion, checked in code

- Button: `mobile/src/app/profile.tsx`, row "Delete Account", shown only when `signedIn`. Two alerts, then `POST` to `{SUPABASE_URL}/functions/v1/delete-account` with the session token. A 200 signs out on the phone.
- Server: `supabase/functions/delete-account/index.ts`. It checks the token, refuses a guest with 403, deletes `conversations` (messages cascade), `api_request_log`, `analyst_feedback`, and `analyst_usage`, then `auth.admin.deleteUser`. Safe to call twice.
- The auth-user delete cascades `profiles`, follows, and `app_activity` (`user_id` references `auth.users` on delete cascade in `supabase/migrations/20261124080000_traction.sql`). The function comment does not name `app_activity`. The foreign key does.
- Images are not in chat history (`mobile/src/lib/chat-store.ts`: "Images aren't stored, only the text"), so there is no image row to delete.
- Policy vs code, for the pull request: the policy says a rated question may be kept with nothing that links it to you. The function deletes `analyst_feedback` and does not write a de-identified copy. Deletion is stricter than that sentence.

### Guest browsing, Analyst notice, gambling line, URLs

- Guest: `mobile/src/lib/auth.tsx` calls `signInAnonymously` when there is no session. `signedIn` is an account with an email. Today, Games, and Pulse load on that session. The Analyst screen shows "Sign In to Ask" until then (`mobile/src/app/(tabs)/analyst.tsx`). `askAnalyst` returns before the network call on a guest (`mobile/src/lib/analyst-api.ts`).
- Analyst notice (D-085): same file, before the first question. Title "Meet Your Analyst". Body "Your questions go to our AI partner to answer, so leave out personal info". Button "Got It", stored on device. The privacy policy names Anthropic and says questions and images go there.
- Responsible gambling: welcome requires "I'm 18 or Older" and shows "Gambling problem? Call 1-800-GAMBLER" (`mobile/src/app/welcome.tsx`). Profile repeats the helpline and "MGP shows data and what betting shows are saying, never its own picks" (`mobile/src/app/profile.tsx`). The number is `tel:18004262537` (`mobile/src/constants/links.ts`). The terms say "MGP is for information and entertainment" and "Play Responsibly". That entertainment sentence is not a separate line in the app. The helpline and the 18+ gate are.
- Privacy and terms: Profile opens `PRIVACY_URL` and `TERMS_URL` from `mobile/src/constants/links.ts` in the in-app browser. Both URLs match the live pages.
- Support: Profile uses `mailto:support@mgp-analytics.com`. The constant is the live address. The comment above it still says the address is a placeholder. The comment is stale. The value is not. `mobile/src/` was not edited for this pass.

## Betting-related content

| Requirement | Guideline | Plan | Status |
|---|---|---|---|
| Legal entity for a highly regulated service | 5.1.1(ix), 5.3 | See the assessment below. An Individual account can submit this app. The LLC is still the plan for the seller name (D-001), not a gate for this submission | done as an assessment; Jerry confirms Entity Type |
| Age rating reflects betting content | Age rating | Answers and the 18+ override are in `APP_STORE_LISTING.md`. Enter them in App Store Connect | in progress |
| No real-money wagering; no purchase tied to wagering | 5.3 | The app takes no bets, holds no money, and has no sportsbook links (D-008). No purchase code in `mobile/` | done |
| Responsible gambling messaging | Best practice | 1-800-GAMBLER on welcome and Profile, plus the 18+ gate. Terms carry the entertainment sentence | done |
| No "picks" or guaranteed-win language from MGP | 2.3, 5.3 | The Analyst is descriptive. Store copy is in `APP_STORE_LISTING.md`. Expert Picks are other people's opinions, credited | done |

## Guideline 5.1.1(ix) and 5.3: Individual account or the LLC first?

**Answer:** MGP can ship from an Individual developer account. It does not need the LLC filed first.

**Risk:** medium. The guideline text does not cover an information app that takes no bets. A reviewer can still read "gambling" broadly and ask for a company or a license. The review notes in `APP_STORE_LISTING.md` are there so the first read is "information only".

**Recommendation:** Submit on the membership you have. Say in the notes that the app shows betting information, takes no bets, accepts no deposits, and does not link to a sportsbook. Do not attach a gambling license. Filing the LLC remains the right step when you want the App Store seller name to be the company instead of a person's name (D-001). That is a seller-name choice. It is not a requirement of 5.1.1(ix) or 5.3 for this app. If a reviewer applies 5.1.1(ix) anyway, reply with the verbs below ("provide services", "offer real money gaming") and the two store examples. Filing the LLC is the fallback, not the plan for this submission.

Confirm Entity Type before you describe the account to Apple. D-083 calls team 4939734628 an organization. D-110, and this pass, say the LLC is not filed. `OWNER_ACTIONS.md` items 1 to 3 are checked as an Organization enrollment, and item 12 still says to look at Entity Type. Those cannot all be a finished LLC enrollment. The seller name on the store is the check: a person's legal name means Individual. A company name means Organization.

### What Apple wrote

Fetched 2026-11-25 from https://developer.apple.com/app-store/review/guidelines/

5.1.1(ix):

> (ix) Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer. Apps that facilitate the legal sale of cannabis must be geo-restricted to the corresponding legal jurisdiction.

5.3, opening and the two rules that matter here:

> Gaming, gambling, and lotteries can be tricky to manage and tend to be one of the most regulated offerings on the App Store. Only include this functionality if you’ve fully vetted your legal obligations everywhere you make your app available and are prepared for extra time during the review process. Some things to keep in mind:

> 5.3.3 Apps may not use in-app purchase to purchase credit or currency for use in conjunction with real money gaming of any kind.

> 5.3.4 Apps that offer real money gaming (such as sports betting, poker, casino games, horse racing) or lotteries must have necessary licensing and permissions in the locations where the app is used, must be geo-restricted to those locations, and must be free on the App Store. Illegal gambling aids, including card counters, are not permitted on the App Store. Lottery apps must have consideration, chance, and a prize.

Apple's review help (same day, https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/) asks for a gambling or lottery license for "Apps offering gambling, lotteries, or real-money gaming", and points that request at 5.3.4. It does not ask an odds or research app for a license.

### Why MGP is outside those sentences

5.1.1(ix) applies to apps that provide the regulated service, and to apps that require sensitive user information. 5.3.4 applies to apps that offer real money gaming. MGP shows odds, line movement, betting splits, stats, Expert Picks from public shows, and an AI chat. It does not take a bet, hold a balance, pay winnings, sell credits to wager, or link out to a sportsbook (D-008). There is no payments code in the app. Email and chat are ordinary account data, not the sensitive information the examples point at (health, a financial account, a government ID).

The age-rating definition of Gambling, fetched the same day, is the same line: betting or wagering with real money, not reading about it. See `APP_STORE_LISTING.md`.

### Comparable apps on the store

The public Seller field is what customers see. Apple shows a person's legal name for an Individual membership and the legal entity name for an Organization. This is not a screenshot of Membership details. It is the public signal.

Fetched 2026-11-25:

- [Odds Journal](https://apps.apple.com/us/app/odds-journal/id6811740810). Seller: Preetkanwar Gill. Developer: Preetkanwar Gill. Category: Sports. Age rating: 18+. The description says it is a research and tracking tool and "does not accept wagers or handle money." Copyright on the page: "© 2026 Odds Journal", with no company suffix. This is the cleanest public example of an information-only betting app sold under a person's name.
- [OddsLogic](https://apps.apple.com/us/app/oddslogic-real-time-odds/id6832702502). Seller: Zachary Allec. Developer: Zachary Allec. Category: Sports. Age rating: 18+. The description says it "is not a sportsbook and does not accept or place wagers, process betting deposits or pay winnings." The copyright line names OddsLogic, LLC, while the Seller is a person. A person can be the App Store seller while an LLC exists on paper. That matches "file the LLC for the seller name later."

Company sellers of the same kind of app (not evidence for an Individual account, evidence that "not a sportsbook" is a normal review posture, and that 18+ is the rating those apps wear): [Action Network](https://apps.apple.com/us/app/action-network-sports-betting/id1083677479) (Better Collective USA, Inc.) and [Betting Insider](https://apps.apple.com/us/app/betting-insider/id6759583074) (Insider Sports Incorporated). Both say they do not accept wagers. Both are 18+ and Sports.

### What would change the answer

A sportsbook link, a deposit, a wager, a purchase of credits to bet, or a paid tip that tells someone what to bet would pull the app into 5.3.4 and, with it, 5.1.1(ix). Do those only after the LLC is the seller and a lawyer has looked at licenses. The paywall in D-002 is a subscription for the app, not a wager, and it is off. Turn it on only with the Paid Apps agreement (see Payments below). It does not, by itself, make MGP a gambling service.

## Intellectual property and data

| Item | Risk | Plan |
|---|---|---|
| Team logos (ESPN CDN) | League trademarks; hotlinked | Not in icon, screenshots, or listing (D-009). Before charging money: license, or switch to team color badges with abbreviations |
| Player headshots | Photo rights belong to leagues and agencies | Same rule as logos: not in store marketing; review before charging money |
| ESPN unofficial endpoints, MLB StatsAPI | Terms restrict commercial use | Acceptable while free; must be resolved before a paywall goes live |
| The Odds API, BallDontLie, Sportradar | Commercial terms vary by plan | Confirm plan tiers allow commercial redistribution before a paywall |
| Stocks.News look and feel | Copycat rejection (4.1) and legal letters | Adopt patterns, not visuals or artwork (see `REFERENCE_STOCKS_NEWS.md`) |

Content Rights in App Information: do not claim the app contains no third-party content. It shows team logos and outside shows.

## Age-verification laws

Several US states have passed app-store age-verification laws. The app's age gate is a self-confirmation ("I'm 18 or Older"), not Apple's Declared Age Range API. Before submission, check which state laws are in force and whether that API is required. Owner: Jerry. Status: todo.

## Payments (v1.1, when the paywall turns on)

- Digital subscriptions sold inside the app must use Apple in-app purchase (3.1.1). Check current US storefront rules on external purchase links before deciding the web vs in-app pricing approach.
- Apple Small Business Program: 15% commission under $1M/year. Enroll when the paywall goes live.
- Needs the Paid Apps agreement, banking, and tax forms in App Store Connect (Account Holder). Not needed while the app is free. Steps are in `APP_STORE_LISTING.md`.
- A subscriber on the web and in the app must see the same entitlement (one source of truth in Supabase).
