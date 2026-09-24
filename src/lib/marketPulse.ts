// Market Pulse (Game Insights): one DraftKings number per market, where the
// bets and the money sit, and three markers computed only from stored data.
//
// The rules live in supabase/functions/_shared/market-pulse.ts (the line rule
// in _shared/dk-line.ts), shared with the chat edge functions so the sheet,
// the slate cards, Today's Board and every chat answer read the same numbers
// and fire the same markers. This module is the app's name for them; the
// tests (src/test/marketPulse.test.ts) import from here.

export * from "../../supabase/functions/_shared/market-pulse";
