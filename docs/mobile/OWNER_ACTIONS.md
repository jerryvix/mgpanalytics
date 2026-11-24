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

## Now: create the App Store record (5 minutes)

- [x] **8. Done 2026-11-24 (Apple ID 6838568637).** Create the app in App Store Connect and send its Apple ID. The signing certificate is made and the first build is running; this record is where TestFlight puts it. The App Store name is public, so you pick it.
  1. Sign in at appstoreconnect.apple.com with the business Apple ID and open **Apps**.
  2. Click **+**, then **New App**.
  3. Platforms: **iOS**. Name: **MGP Analytics** (or the name you want on the App Store; 30 characters max, and it must not be taken). Primary Language: **English (U.S.)**.
  4. Bundle ID: choose **MGP Analytics - com.mgpanalytics.app** (already registered). SKU: `mgpanalytics-ios`. User Access: **Full Access**. Click **Create**.
  5. On the new app's page, open **App Information** (left side). Under **General Information**, copy the **Apple ID** (a number about 10 digits long). It is not a secret.
  6. Send the builder that number. The builder uploads the build to TestFlight and sets up your tester group.

## Now: email that works (about 20 minutes, all free)

Why: Supabase's built-in sender only mails the project's own team, so a friend who taps Forgot Password gets nothing. Sign-up confirmation is off until this is done. Do 9 and 11 together: both add records in the same DNS screen.

- [ ] **9. Resend: account emails (sign-up confirmation, password reset).** Free: 3,000 emails a month, 100 a day.
  1. Sign up at resend.com.
  2. Go to **Domains**, click **Add Domain**, enter `mgp-analytics.com`. Resend shows a few DNS records.
  3. Add each record where your domain's DNS lives (the company you bought the domain from, or Vercel if you bought it there; Vercel's **Domains** page shows which). Then click **Verify** in Resend. It can take a few minutes to an hour.
  4. In Resend, open **Settings**, then **Integrations**, click **Connect to Supabase** and sign in to Supabase. Pick the MGP project, click **Add API Key**, set the sender name to `MGP Analytics` and the sender address to `no-reply@mgp-analytics.com`, then click **Configure SMTP Integration**. No key to copy or paste.
  5. Tell the builder "Resend done". The builder turns sign-up confirmation back on, raises the email limit and tests a reset from an outside address.

- [ ] **11. support@mgp-analytics.com: forward it to your inbox.** It's already in the app, the website and the policies.
  - **If your domain already has email** (for example, you made `apps@mgp-analytics.com` for the Apple ID): add `support` as an alias in that email service. Skip the steps below; they would replace your current mail setup.
  - **If it doesn't:**
    1. Sign up at improvmx.com (free), add `mgp-analytics.com`, and set `support` to forward to the inbox you check.
    2. In the same DNS screen as step 9, add: MX `@` `mx1.improvmx.com` priority 10; MX `@` `mx2.improvmx.com` priority 20; TXT `@` `v=spf1 include:spf.improvmx.com ~all`. If an SPF record (`v=spf1 ...`) already exists on `@`, merge them into one. Resend's records sit on `send.` and `resend._domainkey`, so they don't clash.
    3. Email support@mgp-analytics.com from another address and check it arrives. DNS changes can take a few hours.

## Now: a hard cap on AI spend (1 minute)

- [ ] **10. Set a monthly spend limit on the AI account.** At console.anthropic.com, open **Settings**, then **Limits**, and set a monthly spend limit. Start at **$150**. The app also stops the Analyst for the day after 300 questions from everyone together (D-109), about $30 to $60 a day at most, so this limit is the backstop behind it. An Analyst answer costs about 10 to 20 cents; a player line check is under a cent.

## When you're ready: the LLC

- [ ] **12. File the LLC, then send the builder its exact legal name and state.** The privacy policy and terms say "MGP Analytics" for now and leave out the state and court clause (D-110). With the name and state, the builder updates both in a few minutes. Filing fees and yearly fees vary by state; ask your advisor which state fits.
  - Also check your Apple account: at developer.apple.com/account, open **Membership details** and look at **Entity Type**. If it says **Individual**, the App Store shows your personal name as the seller. Once the LLC exists, Apple Developer Support can move the membership to the company (D-001).

## This week (5 minutes each)

- [x] **4. Create a free Expo account** at expo.dev, ideally with the same business email. The builder will then send a secure form for an access token.
- [ ] ~~**5. Create a free Figma account**~~ Not needed for now: design review happens on the mockup canvas (claude.ai/artifact/7ZWWFemMUESwBoLiFsEk3i).
- [x] **6. Done 2026-11-20.** ~~Optional but valuable (10 minutes):~~ install Stocks.News on your iPhone and screen-record onboarding, the home screen, setting an alert, and the paywall. Drop the recording into the chat. The store screenshots are marketing images; the real flows are what we're modeling.

## Decide now (from Nov 23)

- [x] Pulse plan approved Nov 23: Pulse replaces Insiders; Insiders lives inside it (D-059).
- [x] Insiders channels sent Nov 23: Bear Bets, Hold The Phone, Bookit Blitz. Send more anytime.
- [ ] Merge jerryvix/mgpanalytics#23 on GitHub (approved in principle Nov 23): Title Case labels, plain #12 ranks, and the chat guard that lets basketball splits turn on.

## X takes

- [x] **Set up X takes ingest (D-102).** Done Nov 24. #28 merged, endpoint live and locked (a call without the secret header gets the function's own `401 unauthorized`).
  1. [x] Migration `20261124180000_x_takes.sql` run in the SQL editor and recorded in `supabase_migrations.schema_migrations`.
  2. [x] `X_TAKES_INGEST_SECRET` set in the dashboard (Edge Functions → Secrets). The value lives only in the owner's password manager and Grok Bot's secure form.
  3. [x] `ingest-x-takes` deployed from the dashboard editor as one bundled file built from main, with JWT verification off. The next CLI deploy replaces it with the normal multi-file build.
- [x] **Done Nov 24 by the builder:** `ingest-takes`, `app-feed` and `ingest-x-takes` redeployed with the CLI from main. Redeploy `ingest-takes` and `app-feed` with the CLI (`docs/mobile/RUNBOOK.md`). Until then X picks and notes are stored, but units, post links and market notes don't show in the app (`app-feed`), and Daft Previews rows are tagged `podcast` instead of `youtube`.

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
| Resend (account emails) | Free (3,000 a month, 100 a day) | Now |
| ImprovMX (support forwarding) | Free | Now |
| Anthropic (Analyst, player line checks) | Pay as you go, capped by your monthly limit | Now |
| LLC filing | Varies by state | When you file |
| Figma | Free tier | Now |
| Google Play (Android, later) | $25 one-time | After iOS launch |
| Faster odds polling for real-time alerts | Exact quote coming | Before alerts go live |
| X API for in-app insider posts | On hold (owner, cost) | Only if approved later |
