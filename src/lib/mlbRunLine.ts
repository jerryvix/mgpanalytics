// What counts as a posted DraftKings MLB run line (+/-1.5 with a price) and
// total (above 0). The rule lives in supabase/functions/_shared/mlb-run-line.ts,
// shared with the ESPN odds parser that now stores null for anything else; the
// app's MLB surfaces apply it too, so a row stored before shows each surface's
// empty state, never "+0 (N/A)".

export * from "../../supabase/functions/_shared/mlb-run-line";
