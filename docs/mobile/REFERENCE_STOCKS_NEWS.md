# Reference App: Stocks.News (Market Alerts)

App Store id 6476615803. Seller IR Agency LLC. Category News, rated 18+, 4.7 stars from about 5.1K ratings (as of 2026-11-20). Free with subscriptions: Premium $9.99/month or $97/year after a 7-day trial; several other tiers (Basic, Pro, Elite) listed. Ships an update roughly every one to two weeks.

**What we take:** interaction patterns and information architecture. **What we don't take:** their visual identity, artwork (the 3D metal ticker cards), copy, or exact layouts. See `APP_STORE_COMPLIANCE.md`, Intellectual property and data.

## Store screenshots, in order, and the MGP equivalent

| # | Their headline | What the screen shows | MGP equivalent | v1? |
|---|---|---|---|---|
| 1 | The Biggest Movers in the Market, Live | Ranked list of biggest price moves | Biggest line moves today, ranked by size of move | Yes, Today screen |
| 2 | See What Insiders & Politicians Trade | Filter chips (Senate, House, Buy, Sell), list of named people and their trades | Insiders directory: sharps, insiders, analysts, media, with category chips | Yes, Insiders tab |
| 3 | Get Alerted When a Stock Spikes | "My Alerts" inbox, filter chips (All, Stocks, Forex, Crypto), swipe to edit or remove | Alerts inbox: All, Line moves, Games, Streaks; swipe to edit or remove | Yes, Alerts tab |
| 4 | Follow the Biggest Investors and CEOs | Follow people; "most symbol mentions" | Follow teams, players and insiders; "most talked-about games" | Partly (follows yes, mentions later) |
| 5 | Stop Checking Every Social Feed | Aggregated mention alerts | MGP's own approved line: "Stop checking multiple apps." | Yes, positioning |
| 6 | Practice with $100,000. Risk Nothing. | Paper-trading simulator with balance, P&L, positions | Practice bankroll: track picks with fake money | No, v1.1 (D-010) |

Their tab bar: Home, Scanner, Simulator, Insiders, Tools.

## Lessons from their reviews

- The number one complaint is **alerts arriving late or not at all**. Alerts are only as good as data freshness. MGP odds currently sync about every 6 hours, which is too slow for line-move alerts. Fix before marketing alerts.
- Second complaint: support responsiveness. Ship a real support page and contact email.
- Praise centers on alert usefulness and writing quality. MGP's grounded analyst is the analog.

## Pattern checklist for MGP v1

- [ ] Short visual onboarding that personalizes before asking for anything (sports, teams, alert types)
- [ ] Notification permission via soft asks (optional onboarding screen, bar above the tab bar, "Alert me" on modules); system prompt only after a tap
- [ ] Home is short modules under a sport bar, led by biggest line moves; each module ends in "More"
- [ ] No login wall; sign-in sheet only when following, setting alerts, or opening the Analyst
- [ ] Filter chips at the top of every list
- [ ] Swipe actions on alert rows
- [ ] Large, clean numbers with a colored change indicator (up green, down red) on every row
- [ ] One primary action per screen

## Screen recording teardown (owner's recording, 2026-11-20, 2 min 44 s, signed out)

The recording starts on Home, so it doesn't show first-launch screens or the pricing page. It shows the signed-out experience end to end.

| Pattern | What they do | MGP plan |
|---|---|---|
| **No login wall** | Opens straight to Home with live content. Never asked to sign in while browsing Home, news, calendars, insiders or crypto | Guest browsing (D-014). Account asked only to follow, set alerts, or use the Analyst |
| **Sign-in sheet over teaser content** | On stock detail, a bottom sheet ("Upgrade to Premium to Unlock Exclusive Features", 3 benefits, "Log in or Sign up") sits over the page while the content above stays visible | Same sheet pattern for "Create a free account to follow and get alerts". Paywall copy later (D-002) |
| **Home = module feed** | Scrolling category bar (Overview, Stocks, Crypto, Forex, Indices, Commodities, ETFs, Mutual Funds). Under it, short modules, each ending in "More": top movers, trending/watchlist/alerts cards, news scanner with star filters, news carousel, earnings calendar, simulator promo, popular stocks, trading halts, insider trades, billionaires, stock events, top gainers/losers | Sport bar (All, NFL, NBA, NCAAB, NCAAF, MLB) over modules: biggest line moves, your teams today, tonight's games, hot streaks, insiders, games this week (D-015) |
| **Soft notification asks** | Persistent red bar above the tab bar: "Enable Notifications, Don't miss NEXT ALERT! [Enable]". "Enable Alerts" pill on relevant modules (Trading Halts) | Slim bar above the tab bar plus "Alert me" on modules; system prompt only after a tap (D-018) |
| **Calendar with counts** | Earnings Calendar module lists each weekday with a report count; detail screen has a day strip with count badges | Games this week module (games per day); Games tab opens on a day strip with counts |
| **Detail page** | Header: logo, ticker, exchange chip, name; bell, star, share. Large price, colored change, "As of" timestamp. Scrolling section bar (Overview, Key Stats, Analysis, Technicals, Forecast, News, Earnings, Dividends, Insider Trades, Competitors, Ownership, Chart, Financials, Filings) that jumps down one long page. FAQ accordions per section | Game detail: header with bell, star, share; current line large with change since open and "odds as of"; section bar: Odds, Line movement, Matchup, Streaks, Props, Analyst |
| **Verdict gauges** | "Strong sell ... Strong buy" gauges, analyst-ranking bars | **Not adopted.** MGP is descriptive only (D-016) |
| **Sponsored posts** | "SPONSORED!" press release at the top of Home | **Not adopted.** No paid placements in the feed (D-017) |
| **Disclaimer block** | AI and not-investment-advice disclaimer at the bottom of detail pages | Information-and-entertainment line with 1-800-GAMBLER at the bottom of game detail |
| **Loading** | Gray skeleton blocks per section; "We are preparing data for you" state with icon | Skeletons per module; no spinners on Home |
| **Header** | Menu (left), logo (center), search (right) | Avatar for Profile (left or right), search for teams and players |
| **Premium badges** | "PREMIUM" tags on modules even for free users | None at launch (free); badge system ready for v1.1 |

Frames used on the review board: t=0 s (Home + notification bar), 29 s (calendar day strip), 42 s (Trading Halts + Enable Alerts), 49 s (detail + sign-in sheet), 147 s (disclaimer), 155 s (insiders).

## Source material

- Store screenshots: fetched from the iTunes lookup API on 2026-11-20 (`https://itunes.apple.com/lookup?id=6476615803`). Kept outside the repo; re-fetch for the Figma review page.
- Owner's screen recording (signed out, 2026-11-20). Kept outside the repo; key frames are on the review board.
