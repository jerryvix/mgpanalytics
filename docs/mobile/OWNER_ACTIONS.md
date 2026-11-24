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

## Now: sign-up emails that actually arrive (15 minutes)

- [ ] **9. Set up Resend so sign-up and password-reset emails reach people.** Supabase's built-in sender is for testing, so new people likely never get their confirmation email. The key goes straight into Supabase, never in chat.
  1. Sign up at resend.com with the business email.
  2. Go to **Domains**, click **Add Domain**, enter `mgp-analytics.com`.
  3. Resend shows a few DNS records (MX, TXT for SPF, TXT for DKIM). Add each one where your domain is managed (GoDaddy, Namecheap, Cloudflare or similar), then click **Verify** in Resend. It can take a few minutes to an hour.
  4. Go to **API Keys**, click **Create API Key**, name it `Supabase`, permission **Sending access**, domain `mgp-analytics.com`. Copy the key (Resend shows it once).
  5. Open supabase.com, the MGP project, then **Authentication**, **Emails**, **SMTP Settings**. Turn on **Enable Custom SMTP** and fill in: Sender email `no-reply@mgp-analytics.com`, Sender name `MGP Analytics`, Host `smtp.resend.com`, Port `465`, Username `resend`, Password: the API key. Save.
  6. Tell the builder "Resend done". The builder raises the email limit and tests a sign-up from an outside address.

- [ ] **10. Set a monthly spend limit on the AI account.** At console.anthropic.com, open **Settings**, then **Limits**, and set a monthly spend limit you're comfortable with (for example $300). It's a backstop on top of the 50 questions per person per day cap.

- [ ] **11. Send the support email address** for the app, the privacy policy and App Store Connect (any inbox you check).

## Done: one key so builds reach TestFlight

- [x] **7. Done 2026-11-24.** Create an App Store Connect API key and add it to Expo. With the owner's OK, the builder used it once to create the signing certificate and provisioning profile (D-083); uploads to TestFlight use it from Expo's servers. The key never goes in chat.
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

## X takes (after the branch is merged)

- [ ] **Set up X takes ingest (D-102).** No paid X API. Do this only after `grokbot/x-takes-ingest` is merged, and never paste the secret into chat or the repo.
  1. Run the migration `supabase/migrations/20261124180000_x_takes.sql` on the MGP Supabase project.
  2. Set the secret: `supabase secrets set X_TAKES_INGEST_SECRET=...` (the name is `X_TAKES_INGEST_SECRET`; you choose the value).
  3. Deploy `ingest-x-takes`, and redeploy `ingest-takes` and `app-feed`, the same way other functions are deployed (`docs/mobile/RUNBOOK.md`). Migration first, then the functions.

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
