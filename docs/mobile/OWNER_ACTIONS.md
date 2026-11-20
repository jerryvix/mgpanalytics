# Owner Actions

Things only Jerry can do. Everything not on this list is handled by the builder. Check items off as they're done and note the date.

**Never paste passwords, tokens or keys into chat or into this repo.** When a token is needed, the builder sends a secure form.

---

## Now (critical path, start today)

- [ ] **1. Get a D-U-N-S number for the LLC.** Free. Use Apple's lookup first; the LLC may already have one.
  - Go to developer.apple.com/enroll/duns-lookup and search for the LLC's exact legal name and address.
  - If not found, request one from the same page. It usually arrives in about 5 business days.
  - The legal name, address and phone must match the LLC's state filing exactly, or enrollment stalls.
- [ ] **2. Create a dedicated Apple ID for the business.** Per your advisor: separate from your personal Apple ID.
  - Use a business email you control long-term (ideally on the company domain, for example `apps@mgp-analytics.com`), not a personal Gmail.
  - Turn on two-factor authentication. Save the recovery details in a password manager.
- [ ] **3. Enroll in the Apple Developer Program as an Organization** ($99/year) at developer.apple.com/programs/enroll, signed in with the new Apple ID.
  - You need: the D-U-N-S number, the LLC's legal name, a company website (`mgp-analytics.com` works), and authority to sign for the LLC.
  - Apple may phone you to verify. Answer unknown numbers that week.
  - Tell the builder when the approval email arrives.

## This week (5 minutes each)

- [ ] **4. Create a free Expo account** at expo.dev, ideally with the same business email. The builder will then send a secure form for an access token.
- [ ] **5. Create a free Figma account** at figma.com. The builder will send the import steps for the two review pages.
- [x] **6. Done 2026-11-20.** ~~Optional but valuable (10 minutes):~~ install Stocks.News on your iPhone and screen-record onboarding, the home screen, setting an alert, and the paywall. Drop the recording into the chat. The store screenshots are marketing images; the real flows are what we're modeling.

## Anytime (optional)

- [ ] Send Stocks.News ads when you see them (screenshots or recordings). They'll guide our App Store screenshots and launch ads later; the app build comes first.

## When the builder asks (later, with notice)

- [ ] Supabase access token (secure form), needed for Sign in with Apple, guest sessions (anonymous sign-in) and the alerts tables.
- [ ] After Apple approval: add the builder's App Store Connect API key to Expo (steps will be provided; the key never passes through chat).
- [ ] Review the Figma comments (week 2): keep, cut, or change each note.
- [ ] Install TestFlight and use the app for a few days (week 3).
- [ ] Approve the privacy policy, terms and support page drafts. A short lawyer review is recommended for an 18+ betting-related app.
- [ ] Approve the App Store listing text and screenshots (week 4).
- [ ] Decide on a faster odds plan for real-time line-move alerts (builder will bring the exact monthly cost).
- On hold by owner (2026-11-20): X API spend for showing insider posts in the app (about $75/month estimate, D-021, D-023).

## Costs to expect

| Item | Cost | When |
|---|---|---|
| Apple Developer Program | $99/year | Now |
| Expo (EAS builds) | Free tier should cover v1 | Now |
| Figma | Free tier | Now |
| Google Play (Android, later) | $25 one-time | After iOS launch |
| Faster odds polling for real-time alerts | Exact quote coming | Before alerts go live |
| X API for in-app insider posts | On hold (owner, cost) | Only if approved later |
