# Owner Actions

Things only Jerry can do. Everything not on this list is handled by the builder. Check items off as they're done and note the date.

**Never paste passwords, tokens or keys into chat or into this repo.** When a token is needed, the builder sends a secure form.

---

## Now (critical path)

Apple enrollment confirmed approved by the owner on Nov 23.


- [x] **1. Get a D-U-N-S number for the LLC.** Free. Use Apple's lookup first; the LLC may already have one.
  - Go to developer.apple.com/enroll/duns-lookup and search for the LLC's exact legal name and address.
  - If not found, request one from the same page. It usually arrives in about 5 business days.
  - The legal name, address and phone must match the LLC's state filing exactly, or enrollment stalls.
- [x] **2. Create a dedicated Apple ID for the business.** Per your advisor: separate from your personal Apple ID.
  - Use a business email you control long-term (ideally on the company domain, for example `apps@mgp-analytics.com`), not a personal Gmail.
  - Turn on two-factor authentication. Save the recovery details in a password manager.
- [x] **3. Enroll in the Apple Developer Program as an Organization** ($99/year) at developer.apple.com/programs/enroll, signed in with the new Apple ID.
  - You need: the D-U-N-S number, the LLC's legal name, a company website (`mgp-analytics.com` works), and authority to sign for the LLC.
  - Apple may phone you to verify. Answer unknown numbers that week.
  - Tell the builder when the approval email arrives.

## Now: one key so builds reach TestFlight (10 minutes)

- [ ] **7. Create an App Store Connect API key and add it to Expo.** This lets the builder create the app record and upload builds to TestFlight, with no Apple password shared. The key never goes in chat.
  1. Sign in at appstoreconnect.apple.com with the business Apple ID.
  2. Go to **Users and Access**, then the **Integrations** tab, then **App Store Connect API** (Team Keys). If asked, click **Request Access** and accept.
  3. Click **+** (Generate API Key). Name it `Expo EAS`. Access: **Admin**. Click **Generate**.
  4. Note the **Issuer ID** (top of the page) and the key's **Key ID**. Click **Download** to get the `.p8` file (Apple lets you download it once; keep it in your password manager).
  5. Go to expo.dev, sign in as `jerryvix`, open **Account settings**, then **Credentials**, then **App Store Connect API Keys**, and click **Add**. Upload the `.p8` file, enter the Key ID and Issuer ID, and save.
  6. Tell the builder "ASC key added". Nothing else to send.

## This week (5 minutes each)

- [x] **4. Create a free Expo account** at expo.dev, ideally with the same business email. The builder will then send a secure form for an access token.
- [ ] ~~**5. Create a free Figma account**~~ Not needed for now: design review happens on the mockup canvas (claude.ai/artifact/7ZWWFemMUESwBoLiFsEk3i).
- [x] **6. Done 2026-11-20.** ~~Optional but valuable (10 minutes):~~ install Stocks.News on your iPhone and screen-record onboarding, the home screen, setting an alert, and the paywall. Drop the recording into the chat. The store screenshots are marketing images; the real flows are what we're modeling.

## Decide now (from Nov 23)

- [x] Pulse plan approved Nov 23: Pulse replaces Insiders; Insiders lives inside it (D-059).
- [x] Insiders channels sent Nov 23: Bear Bets, Hold The Phone, Bookit Blitz. Send more anytime.
- [ ] Merge jerryvix/mgpanalytics#23 on GitHub (approved in principle Nov 23): Title Case labels, plain #12 ranks, and the chat guard that lets basketball splits turn on.

## Recommended (5 minutes)

- [ ] Turn on two-factor authentication for the Expo account (expo.dev → Account settings → Security). The account now has an active access token.

## Anytime (optional)

- [ ] Send Stocks.News ads when you see them (screenshots or recordings). They'll guide our App Store screenshots and launch ads later; the app build comes first.

## When the builder asks (later, with notice)

- [x] Supabase access token (secure form). Done Nov 23 ("MGP Claude deploy", 90 days). Delete the earlier "MGP - Claude" token; it only reached mgp-staging.
- [ ] After Apple approval: add the builder's App Store Connect API key to Expo (steps will be provided; the key never passes through chat).
- [ ] Review the Figma comments (week 2): keep, cut, or change each note.
- [ ] Install TestFlight and use the app for a few days (week 3).
- [ ] Approve the privacy policy, terms and support page drafts. A short lawyer review is recommended for an 18+ betting-related app.
- [ ] Approve the App Store listing text and screenshots (week 4).
- [ ] ~~Decide on a faster odds plan for real-time line-move alerts~~ Dropped Nov 23: line movement is a detail, not the product (D-053), so no paid odds feed is planned.
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
