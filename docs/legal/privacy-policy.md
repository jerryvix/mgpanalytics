# MGP Analytics Privacy Policy

> **Notes for the owner (delete this block before publishing)**
> 1. Assumes [LLC LEGAL NAME] runs MGP for people in the US, MGP is free, and there are no ads or analytics tools. Update this policy before adding analytics, paid plans, push alerts, Sign in with Apple or the daily email digest.
> 2. Not built yet: the Profile > Delete Account button in the app (the uncommitted `delete-account` function covers the data side, including `conversations` and `api_request_log`, which don't cascade) and any delete option on the website (this draft says email us). The daily question count assumes the uncommitted 50 per day cap ships.
> 3. Found in the code: no analytics, pixels, Sentry or similar. The website loads X's widget script on every page (from `index.html`) plus Google Fonts. Ask a lawyer whether X's script counts as "sharing" under California law, or load it only on pages that show X posts.
> 4. For a lawyer: gambling-adjacent content and state age rules (18 vs 21, new app store age verification laws), the AI disclosure (questions and images go to Anthropic), and Anthropic's current terms on training and retention. Bracketed numbers like [90 days] are suggestions to confirm.

**Effective date:** [EFFECTIVE DATE]

This policy explains what [LLC LEGAL NAME] ("MGP," "we," "us") collects when you use the MGP Analytics website at mgp-analytics.com and the MGP Analytics iPhone app, why we collect it, who we share it with, and the choices you have.

## The Short Version

- We collect what we need to run MGP: your account, the questions you ask the Analyst, feedback you give us, and basic technical logs.
- Your Analyst questions and any images you attach go to Anthropic, the AI company behind the Analyst, so it can answer you.
- We don't sell your personal data. We don't run ads, and we don't use analytics or ad tracking tools.
- You can delete a chat anytime, and you can delete your account.

## What We Collect

### Your Account

- **Email and password.** You need these to create an account. Your password is handled by Supabase, our sign-in provider, and stored in a scrambled (hashed) form. We can't see it.
- **Google sign-in (website only).** If you sign in with Google, Google shares your name, email address and profile picture with us.
- **Your choices in MGP.** Your favorite sports, what you told us you're interested in when you signed up, and the teams, players and X accounts you follow.
- **Visit streak (website).** While you're signed in, we count the days you visit so we can show your streak.

You can browse the app without an account. You need one to use the Analyst.

### Your Analyst Chats

- **Questions and answers.** We save what you ask and what the Analyst answers, including the web sources it cites, to your account. That lets you open past chats on the website or in the app. A chat's title comes from your first question.
- **Images.** In the app, you can attach up to 4 images from your photo library or paste one from your clipboard, like a screenshot of an odds board or a bet slip. The app shrinks each image and sends it with your question. We don't save images to your chat history.
- **Daily question count.** We count how many questions you ask each day so we can apply the Analyst's daily limit.

Please leave personal details out of your questions and images. For example, crop your name, account number or balance out of a bet slip screenshot before you attach it.

### Your Feedback

When you rate an Analyst answer with a thumbs up or down, we save your rating, the reason you pick, any note you write, and the question, answer and sources it's about.

### Messages to Support

If you email us, we keep your email address and what you send so we can help you.

### Technical Information

- **Server logs.** Our hosting providers automatically log requests to our servers, including your IP address, browser or device type, app version, the time, and the page or feature you used.
- **Error records.** If an Analyst answer fails in the app, the app saves a short error record to your account: the time, how long the request took and an error code. It doesn't include your question.
- **Apple crash reports.** If you've allowed it in your iPhone settings, Apple may share crash reports and basic app usage data with us.

### What's Stored on Your Device

- **In the app:** your sign-in session, so you stay signed in, and a note that you've seen the Analyst notice. Images you attach may sit briefly in the app's temporary cache on your phone.
- **On the website:** your sign-in session and display settings (like whether the chat panel is open and how wide it is, and whether you've seen the walkthrough) in your browser's local storage, a small cookie that remembers whether the sidebar is open, and short-lived copies of public sports data so pages load faster.

These stay on your device. We don't use them to track you across other websites or apps.

### What We Don't Collect

- We don't ask for your location, contacts, camera or microphone. The app asks for access to your photos only when you choose to attach an image, and it reads your clipboard only when you tap Paste.
- We don't collect payment details. MGP is free today.
- We don't connect to your sportsbook accounts.

## How We Use It

- **To run MGP:** create and protect your account, sign you in, and save your chats, follows and settings.
- **To answer your questions:** send your question to the Analyst and show you its answer.
- **To make the Analyst better and fix problems:** we review ratings and failed answers. When we look into one, the people who run MGP may read the question and answer involved.
- **To keep MGP safe:** prevent abuse, enforce usage limits and our Terms of Use.
- **To contact you about your account:** sign-up confirmation, password reset and important changes to our policies. We won't send you marketing emails unless you choose to get them.
- **To follow the law.**

## Who We Share It With

We share personal data only with the companies that help us run MGP, and only what each one needs to do its job.

| Company | What it does for MGP | What it receives |
|---|---|---|
| **Supabase** | Hosts our database, sign-in, account emails and the Analyst's server code | The account, chat, feedback and log data described above |
| **Anthropic** | Runs the AI behind the Analyst, including its web searches | Your question, the recent messages in that chat (up to 20), any images you attach, and MGP sports data we add to help answer. Not your name or email address |
| **Vercel** | Hosts the website | Server log data, like your IP address and browser type |
| **Expo** | Delivers updates to the iPhone app | Your IP address, the app version, your device platform and a random install ID |
| **Google** | Google sign-in on the website, and the website's fonts | Your sign-in, if you use Google. For fonts, your IP address and browser type |
| **X (Twitter)** | Shows X posts on some website pages | Your browser loads X's code, which can receive your IP address and the page you're on and can set X's own cookies |
| **ESPN and MLB** | Send team logos, live scores and some stats straight to your browser or phone | Your IP address and browser or device type |
| **Apple** | Distributes the app and provides crash reports you allow | What Apple's own privacy policy describes |

**About the Analyst.** When the Analyst searches the web, Anthropic runs the search, based on your question. We don't add your name or email address to your questions or searches. Under Anthropic's commercial terms, it doesn't use this data to train its AI models.

**If we add paid plans.** Apple would handle purchases in the app and Stripe would handle purchases on the website. They collect your payment details, and we would get only what we need to know about your subscription, like your plan, its status and its renewal date. We would never see your full card number.

**Other times we may share data:**

- **The law:** to comply with a law, a court order or a valid legal request.
- **Safety:** to protect you, other people or MGP's rights and security.
- **A business change:** if MGP is sold or merges with another company, your data may move to the new owner, who must keep protecting it as this policy says or tell you first.

## We Don't Sell Your Data

We don't sell your personal data, and we don't share it for targeted advertising. MGP doesn't show ads.

## How Long We Keep It

- **Account and settings:** while your account is open.
- **Chats:** until you delete the chat or your account.
- **Feedback:** until you delete your account. We may keep a rated question, with nothing that links it to you, to test fixes to the Analyst.
- **Daily question counts:** until you delete your account.
- **Server logs and error records:** [90 days], unless we need them longer to look into a security problem.
- **Support emails:** as long as we need them to help you, up to [2 years].

When you delete your account in the app, we delete it and the personal data tied to it right away. When you ask by email, we do it within [30 days]. Copies in our backups and our hosting providers' logs are removed as those are replaced. We keep anything the law requires us to keep.

## Deleting Your Data or Your Account

- **Delete a chat in the app:** open History, tap the chat's menu button, then Delete Chat.
- **Delete a chat on the website:** use the trash icon to delete the current chat, or clear all your chats from the sidebar.
- **Delete your account in the app:** go to Profile > Delete Account. This deletes your account along with your chats, feedback, follows and settings.
- **Delete your account from the website:** email [SUPPORT EMAIL] from the email address on your account and ask us to delete it. We'll confirm when it's done.

Deleting the app from your phone, or signing out, removes what's stored on that device but doesn't delete your account. If you ever subscribe through Apple, deleting your account doesn't cancel the subscription. Cancel it in your iPhone's Settings.

## Age Requirements

MGP is for adults. You must be 18 or older to use it, or 21 or older where your state's law requires that age for sports betting content. We don't knowingly collect personal data from anyone under 18. If you think someone under 18 has given us personal data, email [SUPPORT EMAIL] and we'll delete it.

## Your Privacy Rights

Depending on where you live, state privacy laws (in California, Colorado, Connecticut, Virginia and other states) may give you the right to:

- Know what personal data we have about you and get a copy of it
- Correct it if it's wrong
- Delete it
- Opt out of the sale of your data, targeted advertising and certain profiling (we don't do any of these)
- Use these rights without being treated differently

To make a request, email [SUPPORT EMAIL]. We'll confirm it's you, usually by asking you to write from the email address on your account, and we'll respond within the time your state's law allows (45 days in most states). You can have an authorized agent make a request for you with your written permission. If we turn down your request, you can appeal by replying to our decision. If you're still not satisfied, you can contact your state's attorney general.

We honor these requests no matter which state you live in.

**Do Not Track.** We don't track you across other websites, so we don't treat Do Not Track signals differently. Third-party code, like X's, follows its own policies.

## How We Protect Your Data

- Data moves between your device and our servers over encrypted connections (HTTPS).
- Your chats, feedback, follows and settings are locked to your account in our database, so other users can't read them.
- Passwords are stored hashed, never in plain text.
- Only the people who run MGP can get into our systems.

No system is perfectly secure, so we can't promise your data will never be exposed. If a breach affects your data, we'll tell you as the law requires.

## Where MGP Is Offered

MGP is meant for people in the United States.

## Changes to This Policy

We'll update this policy when we change how MGP handles data, for example if we add paid plans or alerts. We'll change the effective date at the top. For important changes, we'll tell you in the app or by email before they take effect.

## Contact Us

Questions about this policy or your data? Reach us at:

[LLC LEGAL NAME]\
[MAILING ADDRESS]\
[SUPPORT EMAIL]
