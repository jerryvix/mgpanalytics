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
- [ ] Notification permission asked at the end of onboarding, with a clear "here's what you'll get" screen
- [ ] Home leads with one ranked "movers" list, not a dashboard of widgets
- [ ] Filter chips at the top of every list
- [ ] Swipe actions on alert rows
- [ ] Large, clean numbers with a colored change indicator (up green, down red) on every row
- [ ] One primary action per screen

## Source material

- Store screenshots: fetched from the iTunes lookup API on 2026-11-20 (`https://itunes.apple.com/lookup?id=6476615803`). Kept outside the repo; re-fetch for the Figma review page.
- Real in-app flows (onboarding, paywall): pending the owner's screen recording (`OWNER_ACTIONS.md` item 6).
