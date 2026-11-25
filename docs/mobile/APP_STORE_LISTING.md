# App Store Listing

Ready-to-paste values for App Store Connect. App: MGP Analytics. Apple ID 6838568637. Bundle `com.mgpanalytics.app`. Checked 2026-11-25 against the current App Store Connect help and the live guidelines.

Click paths use the current layout: open the app and you land on the Distribution tab. Shared facts sit under General. The version sits under the iOS platform. App Privacy and TestFlight are their own places on the same app.

Nothing here is entered in App Store Connect yet. Do not invent the demo account password. Do not put it in git.

Copy rules for every paste value: traced to `docs/positioning.md` (source line noted on each field), second person where it speaks to a reader, no em or en dashes, no competitor names, odds are not called real time, and MGP does not tell anyone what to bet. Labels are Title Case. The description drops only its final period (D-040).

## URLs

### Privacy Policy URL

Paste:

```
https://mgp-analytics.com/privacy
```

Path: Apps > MGP Analytics > App Privacy (sidebar) > next to Privacy Policy, click Edit > Privacy Policy URL > Save.

Source: D-110. The page is live. The same URL is in the app at `mobile/src/constants/links.ts` (`PRIVACY_URL`), opened from Profile.

### Support URL

Paste:

```
https://mgp-analytics.com/support
```

Path: Apps > MGP Analytics > Distribution > iOS App > the 1.0 version (Prepare for Submission) > Support URL.

The page is live and shows support@mgp-analytics.com, which is the contact Apple asks a support URL to lead to. There is no mailing address (D-110: email only). If a reviewer asks for a postal address, that is Jerry's call. Do not invent one.

In the app, Profile emails that address. It does not open this URL.

### Marketing URL (optional)

Paste, or leave blank:

```
https://mgp-analytics.com
```

Path: same version page > Marketing URL.

Source: the public site. Not a claim from `docs/positioning.md`.

## Name, subtitle, promotional text, description, keywords

### Name

Paste:

```
MGP Analytics
```

13 characters. Limit 30.

Path: Apps > MGP Analytics > Distribution > sidebar General > App Information > Name.

The record already uses this name (D-083). Leave it.

### Subtitle

Paste:

```
Bet Smarter, Not Harder
```

23 characters. Limit 30.

Path: App Information > Subtitle. Same page as Name.

Source: `docs/positioning.md`, "Shipped pitch lines", the /why hero: "Bet Smarter, Not Harder. Get real insights."

### Promotional Text

Paste:

```
Get an edge on the books. See the bets and the money, then ask the Analyst about tonight's game
```

95 characters. Limit 170. This field can change later without a new review.

Path: Distribution > iOS App > 1.0 > Promotional Text.

Source: "Get an edge on the books." is the landing hero in "Shipped pitch lines". "The bets and the money" is the public betting split (audit note, 2026-11-21: real for NFL and college football). "Ask the Analyst" is advantage 1, the grounded analyst.

### Description

Paste:

```
Bet Smarter, Not Harder.

MGP Analytics brings odds, line moves, and betting splits for NFL, college football, and NBA games into one app.

Betting Splits show the share of bets and the share of money on each side.

Ask the Analyst about games, odds, splits, and trends.

Capper Picks show what public shows are saying, with the show credited.

Browse without an account. Sign in when you want to ask the Analyst.

MGP shows information. It does not take bets or hold your money
```

478 characters. Limit 4000.

Path: Distribution > iOS App > 1.0 > Description.

Source, by sentence:

- "Bet Smarter, Not Harder." Shipped pitch lines, /why hero.
- Odds and line moves. Shipped pitch lines, landing hero ("Live odds. Line moves."). The word "Live" is left out on purpose. "Known copy debt" says odds are not real time. Terms: they update on a schedule, about every 6 hours.
- NFL, college football, and NBA. Those are the sports in the app (`mobile/src/lib/feed.ts`, `SPORTS`). Positioning covers more sports than the app ships. The description names only the three on the board.
- Share of bets and share of money. Audit note, 2026-11-21: public betting % is real for NFL and college football. That note still said NBA was not available. The app's board includes NBA (`mobile/src/lib/feed.ts`), and a market with no real split is hidden (D-088). The description names NBA because the app does.
- Ask the Analyst about games, odds, splits, and trends. Advantage 1, and the in-app notice (D-085). The sentence does not say the Analyst tells you what to bet. Guardrail in advantage 1: no "should bet", no "lock".
- Capper Picks. The section name is in the app (welcome screen, D-093). Positioning's rule is that MGP does not sell picks. The sentence credits the shows and does not call them MGP's advice.
- Browse without an account. D-014, built. Not a positioning claim. It is how the app works, and App Review asks for it.
- Does not take bets or hold money. Terms, "MGP Isn't Betting Advice". Required so the description is not a gambling claim (guideline 2.3.1 and 5.3).

Not used, from "DO NOT CLAIM": Kalshi, real time, 50+ sportsbooks, "Powered by Gemini", live futures.

### Keywords

Paste, with the commas and without spaces:

```
betting,odds,splits,lines,spreads,totals,moneylines,props,nfl,nba,ncaaf,trends,matchups,scores
```

94 characters. Limit 100. No spaces. The app name is not repeated.

Path: Distribution > iOS App > 1.0 > Keywords.

Source: the same feature words as the description (odds, splits, lines, the NFL / NBA / college football board, trends). Spreads, totals, moneylines, and props are markets the app shows. Scores are on final games. "betting" matches the category of the product. No competitor names. No "picks", "lock", or "guaranteed".

## Category

Path: Distribution > App Information > Category, Primary and Secondary.

- Primary: **Sports**.
- Secondary: **Reference**, or leave it empty.

Sports is where the comparable information apps sit (Odds Journal, OddsLogic, Action Network). Reference fits a numbers app. Do not choose Games. A Games category pulls game-rating rules, including Korea's simulated-gambling review. MGP is not a game (D-010, the practice bankroll is deferred).

## Age rating

Path: Distribution > App Information > Age Ratings > Set Up Age Ratings (or Edit).

Apple's questionnaire, fetched 2026-11-25 from [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/). Steps in that help: in-app controls and capabilities first, then each content section, then the override.

The new global ratings (iOS 26, iPadOS 26, macOS Tahoe 26, and the matching tvOS, visionOS, and watchOS) are 4+, 9+, 13+, 16+, and 18+. There is no 17+ on that scale. Devices on older systems still show the older scale, where the top ordinary rating is 17+.

### In-app controls and capabilities

Answer No to each.

| Question | Answer | Why |
|---|---|---|
| Parental Controls | No | None in the app |
| Age Assurance | No | Welcome asks the person to tap "I'm 18 or Older". That is a self-confirmation. Apple's definition is a mechanism that confirms age (Declared Age Range API, estimation, or a government ID). The app does not call that API. FLAG: do not check Age Assurance unless that API is added |
| Unrestricted Web Access | No | The app opens specific https links (Analyst sources, X posts, privacy, terms) in the system browser sheet. There is no address bar and no general browser. FLAG: if a reviewer treats that sheet as unrestricted web access, the calculated rating becomes 16+ on the new scale. The override below still sets 18+ |
| User-Generated Content | No | Apple's definition is content the app broadcasts to many users. Chats stay on the account. Feedback stays on the account. Capper Picks are from outside shows, not from app users |
| Social Media | No | No social feed of user posts |
| Messaging and Chat | No | Apple's definition is users communicating with one another. The Analyst is an AI chat with one person. FLAG: there is no separate "AI chat" question on the published questionnaire. Do not check Messaging and Chat to cover the Analyst. The AI disclosure is the in-app notice and guideline 5.1.2(i), not this age question |
| Shared Location | No | The app does not ask for location |
| Advertising | No | No ads |

### Content descriptions

Answer None for every frequency. The ones that decide a betting app are called out.

| Question | Answer | Why |
|---|---|---|
| Gambling | None | Apple's definition: "Betting or wagering using real money or in-game currency that may be exchanged for real money." The app does not take a bet. Showing odds is not this control. Checking it would describe a real-money gaming app and invite a license request under 5.3.4 |
| Simulated Gambling | None | "Betting or wagering without using real money." No practice bankroll (D-010). Infrequent simulated gambling is 13+ globally and can be R 18+ in Australia. Frequent is 18+. Neither applies |
| Contests | None | No contests, rankings, or prizes between users |
| Loot Boxes | None | None |
| Profanity, horror, alcohol or drugs, medical treatment, sexual content, violence, weapons | None | Not in the app |
| Mature or Suggestive Themes | None | Betting information is not in Apple's examples for this descriptor (sexual innuendo, crime, trauma, war). The 18+ override carries the age gate instead |

### Override

On the last step, Age Categories and Override: choose **Override to Higher Age Rating**, then **18+**.

Not Applicable would publish whatever the Nones calculate, which can be 4+. That would contradict the in-app 18+ gate and the terms (18, or 21 where a state requires it for sports betting content).

### Expected rating

- New scale (iOS 26 and later): **18+**, from the override, not from the Gambling checkbox.
- Older systems: open the preview Apple labels "Operating Systems Earlier than Version 26" on the same Age Ratings section and confirm it before you submit. The older global scale has no 18+. Its rating for gambling content is 17+ ([the same help page](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/), "Global age ratings"). France shows 18+ for a 17+ global rating on that older scale. Expect **17+** on older OS, and confirm the preview rather than assuming the mapping of an override.
- Made for Kids: No.

## App Privacy

Path: Apps > MGP Analytics > App Privacy. Privacy Policy URL is the Edit button next to Privacy Policy (above). The nutrition label is the questionnaire on that page (Get Started the first time, Edit after).

Apple's definition of collected, fetched 2026-11-25 from [App privacy details](https://developer.apple.com/app-store/app-privacy-details/):

> “Collect” refers to transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time.

The same page, under additional guidance:

> “Collect” refers to transmitting data off the device and storing it in a readable form for longer than the time it takes you and/or your third-party partners to service the request. For example, if an authentication token or IP address is sent on a server call and not retained, or if data is sent to your servers then immediately discarded after servicing the request, you do not need to disclose this in your answers in App Store Connect.

Tracking, same page:

> “Tracking” refers to linking data collected from your app about a particular end-user or device, such as a user ID, device ID, or profile, with Third-Party Data for targeted advertising or advertising measurement purposes, or sharing data collected from your app about a particular end-user or device with a data broker.

First question in the questionnaire: **Do you or your third-party partners collect data from this app?** Yes.

**Do you or your third-party partners use data from this app for tracking?** No.

No ads, no ad SDK, no analytics SDK in `mobile/package.json`. The privacy policy says MGP does not sell personal data and does not use outside analytics or ad tracking. `app_activity` is MGP's own count. That is Analytics, not tracking.

Used for tracking is No on every row below.

| Data | Apple type | Linked to the user | Tracking | Purposes | Why |
|---|---|---|---|---|---|
| Email | Contact Info > Email Address | Yes | No | App Functionality | Account email, stored by Supabase. Profile shows it. Not collected from a guest |
| User ID | Identifiers > User ID | Yes | No | App Functionality | Supabase user id for the account and for the anonymous guest. Stored, and it is the key on chats, feedback, and `app_activity` |
| Chats with the Analyst | User Content > Other User Content | Yes | No | App Functionality | Questions, answers, and cited sources are saved to the account until the chat or the account is deleted (`mobile/src/lib/chat-store.ts`). Apple's free-form text example is Other User Content, not Emails or Text Messages. That second type is for messages between people |
| Images sent to the Analyst | User Content > Photos or Videos | Yes | No | App Functionality | The person attaches up to 4 photos. They leave the device, the edge function receives them, and Anthropic receives them. FLAG below |
| Days used | Usage Data > Product Interaction | Yes | No | Analytics | `app_activity` is one row per user id per Eastern day (`mobile/src/lib/activity.ts`). Apple's example for Product Interaction includes app launches. The purpose "measure audience size" is Analytics. It is not shared with an analytics company |
| Error records | Diagnostics > Other Diagnostic Data | Yes | No | App Functionality | A failed Analyst call writes `api_request_log`: user id, endpoint, status, duration, and a short reason, up to 300 characters (`mobile/src/lib/analyst-api.ts`). The question is not included. Kept until the account is deleted |
| Crash data | Do not declare Crash Data | | | | No crash SDK in the app. Crashes go to Apple. FLAG below |

Also answer, if the questionnaire asks in a later step: data is not used for third-party advertising, and not for the developer's advertising or marketing. Account email is used to run the account (sign-in, password reset). The policy says marketing email is off unless the person opts in. Do not check Developer's Advertising or Marketing.

### Flags

- **Images, retention. Unsure.** MGP does not save images into chat history (policy and `chat-store.ts` agree). They are still sent to Anthropic. If Anthropic keeps the request after the answer is returned, Apple's definition counts them as collected, so declare Photos or Videos. If both MGP and Anthropic discard the image as soon as the answer is served, they are not collected and this row should come off. The policy does not say which. Declare them until that retention is confirmed in the Anthropic account. Linked stays Yes either way you treat a stored copy: the upload is on an authenticated request, and the policy does not say the image is stripped of the user id before it is kept. Anthropic is not given the name or the email.
- **Crash Data. Unsure only if someone downloads Apple's reports and joins them to accounts.** The privacy page says: "You are not responsible for disclosing data collected by Apple." The app does not include a crash reporter. Leave Crash Data off. If crash reports are later pulled out of App Store Connect and stored with user ids, add Crash Data, linked Yes, tracking No, purpose App Functionality.
- **Expo install id. Unsure.** The policy says Expo, which delivers app updates, receives the IP address, app version, device platform, and a random install id. `expo-updates` is in the app (`mobile/package.json`). This pass did not confirm how long Expo keeps that id. If it is kept past the update check, add Identifiers > Device ID, linked No (it is not the account id), tracking No, purpose App Functionality. If it is discarded when the check finishes, do not add it.
- **Server logs and IP. Unsure as its own row.** The policy says hosting logs (IP, browser or device, app version, time, page) are kept, usually no more than 90 days. That meets "collected". They are not used as location, so do not declare Precise Location or Coarse Location. They fit Other Diagnostic Data, which is already declared for error records, purpose App Functionality (security and server uptime). No separate row unless the questionnaire forces IP into Device ID. Do not check Device ID for the IP.
- **Website-only data stays off this label.** Google sign-in on the website shares name, email, and profile photo (policy, "Your Account"). The iPhone app has no Google button and Profile shows email only. Do not declare Name, or Photos for a Google profile photo, on the iOS label.
- **signup_source** (`app` or `web` on the account) is account metadata, covered by the User ID / account row. No extra type.
- **Follows and favorite teams** are in the policy ("Your choices in MGP"). The iPhone app does not write them (`mobile/src` has no follows UI). Do not declare them for the app until that screen exists.

## App Review notes

Path: Distribution > iOS App > 1.0 > scroll to App Review Information.

Contact (Jerry fills the name and phone; the email can be the support address):

- First name: `[Jerry]`
- Last name: `[Jerry]`
- Phone: `[Jerry: include + and the country code, for example +1]`
- Email: `support@mgp-analytics.com`

Sign-in required: **on**.

- User name: `[Jerry: the reviewer account email]`
- Password: `[Jerry: the reviewer account password]`

Do not invent these. Do not commit them. The account has to keep working for as long as the version is in review. Finish the 18+ welcome on that account before you submit, so the reviewer is not stuck on the gate. The reviewer still needs to see the gate once. If the demo account has already passed it, say so in the notes and point at a fresh install for the welcome screen.

Notes, paste, then add the two credential lines when they exist:

```
MGP Analytics is a sports information app for NFL, college football, and NBA games. It shows odds, line movement, and public betting splits (the share of bets and the share of money). It does not take bets, accept deposits, hold a balance, or link to a sportsbook. Nothing in the app is a wager.

The Analyst is an AI chat. It needs an account. Before the first question, the app shows a one-time notice that the question goes to our AI partner, with a Got It button. Guests can browse Today, Games, and Pulse without an account. Sign-in is email and password only. The app does not offer Google sign-in or any other third-party login.

The welcome screen asks the person to confirm they are 18 or older and shows 1-800-GAMBLER. The age rating is overridden to 18+.

Demo account (email and password, not a social login):
Username: [Jerry]
Password: [Jerry]
```

Attachment: none. Do not attach a gambling license. This app does not offer real-money gaming (see `APP_STORE_COMPLIANCE.md`).

Copyright, on the same version page: `2026 MGP Analytics`. Apple adds the copyright symbol. Use "MGP Analytics" until the LLC is filed (D-110).

Content Rights, on App Information: the app displays third-party material (team logos, outside shows). Do not answer that it contains none.

Export compliance: `mobile/app.json` sets `ITSAppUsesNonExemptEncryption` to false. If a build still asks, answer that the app uses encryption only for HTTPS, which is exempt.

Screenshots are not drafted in this file. App Review requires them. No team or league logos in screenshots or the icon (D-009).

## TestFlight external testing

An internal group has to exist before an external one. "Team (Expo)" is already the internal group (`RUNBOOK.md`).

Create the external group: Apps > MGP Analytics > TestFlight > sidebar, + next to External Testing > name the group > Create.

Test information (description, email, contact, beta review notes, demo account): Apps > MGP Analytics > TestFlight > sidebar Additional > Test Information.

What to Test: TestFlight > External Testing > the group > Add Builds (or + next to Builds) > pick the iOS build > the What to Test field. You can also edit it on the build after.

Role for these screens: Account Holder, Admin, or App Manager. The phone number and the demo account are Jerry's. See the list at the end.

### Beta App Description

Paste:

```
MGP Analytics is your sports research app for the NFL, college football and the NBA. Get matchup stats, trends, market data and historical records for every game. Ask the Analyst, an AI research assistant, anything about a matchup. Browse as a guest, or sign in to chat.
```

Source: the owner's approved wording (Nov 25). Lead with research and data, not betting: sports betting isn't legal everywhere, and MGP is a sports information app. Don't use "predictions" (MGP doesn't predict outcomes, and `docs/positioning.md` rules out prediction-market claims). The "no wagering, no deposits, no sportsbook links" line stays in the Beta App Review notes, which only Apple sees.

### What to Test

Paste:

```
Please look at a normal session.

- The welcome screen, the 18 or older button, and the 1-800-GAMBLER line.
- Today, Games, and Pulse without an account.
- Sign in, read the Analyst notice, tap Got It, and ask a question.
- Profile: Privacy Policy, Terms of Use, Contact Support, and Delete Account (use a test account, not your main one).
- Close the app and open it again after an update is published. The update should apply on that open when the download finishes within a few seconds.
```

### Feedback Email

Paste:

```
support@mgp-analytics.com
```

### Contact

On Test Information:

- First name: `[Jerry]`
- Last name: `[Jerry]`
- Phone: `[Jerry: + and country code]`
- Email: `support@mgp-analytics.com`

### Beta App Review notes

Sign-in required: on. Same demo account as App Review. Placeholder only:

- User name: `[Jerry: reviewer email]`
- Password: `[Jerry: password]`

Notes, paste:

```
Information app. No wagering, no deposits, no sportsbook links. Guests can browse. The Analyst is AI and needs an account. A one-time notice appears before the first question. Sign-in is email and password only.

Demo account:
Username: [Jerry]
Password: [Jerry]
```

After the build is approved for beta, start testing for the external group. The first build of a version gets a fuller beta review than later builds of that version.

## Jerry only

These need Jerry. An Admin can click some of the same screens. The account, the phone number, the membership, and the paid agreement cannot be delegated.

1. **Demo account.** Create a real email-and-password account on the live app (not a guest, not a Google account). Pass the 18+ welcome, or be ready to tell the reviewer a fresh install shows it. Then enter the email and password in two places, and nowhere else:
   - Apps > MGP Analytics > Distribution > iOS App > 1.0 > App Review Information > Sign-in required.
   - Apps > MGP Analytics > TestFlight > Test Information > sign-in fields.
   Do not send the password in chat or put it in the repo.

2. **Your contact on those same two screens.** App Review Information and Test Information each want a first name, last name, and phone. The phone field wants a plus sign and a country code. Email can be support@mgp-analytics.com.

3. **Entity type, Account Holder.** developer.apple.com/account > Membership details > Entity Type. If it says Individual, the store seller is your personal name. This app can still be submitted (see `APP_STORE_COMPLIANCE.md`). Moving the membership to an LLC, after the LLC is filed, is an Account Holder request to Apple Developer Support. It is not required for this submission.

4. **Agreements, tax, and banking, only if you charge.** A free app with no in-app purchase does not need the Paid Apps agreement. When the paywall turns on (D-002): Business (top of App Store Connect) > Agreements > Paid Apps > View and Agree to Terms. Tax and banking are on that same Paid Apps row after you agree. Account Holder only. Skip this while the app is free.

5. **External testers, if you are the one who submits the group.** TestFlight > External Testing > the group > Add Builds > What to Test (paste from above) > Submit Review. Use the demo account from step 1 in Test Information first, or beta review has nothing to sign in with.
