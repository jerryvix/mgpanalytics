# Payments: how a subscription would work (D-002, D-084)

**Status (Nov 24):** nothing is charged. MGP is free at launch with the paywall built in but switched off (D-002). This is the plan for when it turns on.

## The flow

| Step | iPhone app | Website |
|---|---|---|
| See the offer | A paywall screen (price, trial, what's included) when someone taps a paid feature | Same offer on a pricing page |
| Pay | Apple's in-app purchase sheet (Face ID or a side-button double-click, card on the person's Apple account). Required for digital subscriptions bought in the app (guideline 3.1.1) | Stripe's hosted Checkout with Apple Pay, Google Pay and cards (D-084) |
| Optional (US only) | A "Subscribe on the web" link to the Stripe page next to in-app purchase. Apple's fee on those purchases is before the Supreme Court as of Nov 2026: check before relying on it | n/a |
| Unlock | The app's entitlement hook reads the person's subscription from the server and unlocks everywhere, website and app, on the same MGP account | Same |
| Manage or cancel | iOS Settings > Apple ID > Subscriptions (Apple's rule); a Manage Subscription link in Profile opens it | Stripe's customer portal from the account page |
| Renewals, refunds, lapses | App Store Server Notifications (v2) update the server | Stripe webhooks update the server |

## Where the subscription lives

One server-side table, for example `entitlements (user_id, source 'apple' | 'stripe', product, status, renews_at, updated_at)`, written only by the server (Apple notifications, Stripe webhooks), never by the app or website. The audit found that people can edit their own `profiles` row today, including `trial_ends_at`, so trial and paid status must not live in `profiles` (audit S6).

## Build options

- **RevenueCat** (recommended for speed): one SDK for in-app purchase in the app plus Stripe on the web, and it keeps the entitlement in sync. Free until about $2,500 a month in subscription revenue, then 1%. Needs a new store build (native module).
- **Direct**: `expo-iap` (StoreKit 2) plus our own receipt checks and Apple notifications endpoint, Stripe webhooks for the web. No fees beyond Apple's and Stripe's, more to build and maintain.

## Costs per subscription

- **Apple:** 15% with the App Store Small Business Program (under $1M a year; enroll before charging), 30% without it.
- **Stripe (web):** about 2.9% + 30 cents per charge in the US; Apple Pay adds nothing.

## Decisions for the owner (when the paywall turns on)

1. Price and trial (monthly, yearly, free trial length).
2. What stays free and what's paid.
3. RevenueCat or direct.
4. Whether to add the US "Subscribe on the web" link.

## Owner steps before the first charge

1. App Store Connect: accept the Paid Apps agreement, add banking and tax forms.
2. Enroll in the App Store Small Business Program.
3. Create the subscription products in App Store Connect.
4. Stripe account for the LLC (website).
5. Data-licensing check before charging for DraftKings-sourced numbers (D-002).
