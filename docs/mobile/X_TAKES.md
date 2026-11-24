# X Takes Ingest

Public posts on X are a free source for Takes. There is no paid X API. An assistant reads the posts with its own X access, extracts each item, and POSTs a batch here. MGP checks a shared secret, checks the shape, matches each item to an ESPN game, and stores it.

Picks (BookitWithTrent, Trent Attyah) go into `takes` and show in Takes. Market notes (johnewing, John Ewing, BetMGM) go into `market_notes` and show beside Betting Splits. A note is never stored as a pick. The screen credits the registered person and links to the post. The `author` field is required, and the credit on screen still comes from the registry, not from that field.

Decision: D-102.

## Endpoint

`POST https://vwezujtftfccamoduglp.supabase.co/functions/v1/ingest-x-takes`

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-takes-ingest-secret` | the Supabase secret `X_TAKES_INGEST_SECRET` |

The secret is not in this repo. The owner sets it and shares it with the assistant outside the repo. A call without the header, or with the wrong value, is `401`. If the secret is not set on the project yet, the function answers `500` with `X_TAKES_INGEST_SECRET not set`.

The function does not check a user JWT (`verify_jwt` is off). If the Supabase gateway refuses the call before this function runs, send the project's public anon key as `apikey` and as `Authorization: Bearer <anon key>` as well. That key is not the ingest secret, and the function does not treat it as one.

## Body

```json
{
  "items": [
    {
      "post_id": "1234567890",
      "url": "https://x.com/BookitWithTrent/status/1234567890",
      "handle": "BookitWithTrent",
      "author": "Trent Attyah",
      "posted_at": "2026-11-24T15:00:00Z",
      "kind": "pick",
      "sport": "NFL",
      "text": "Commanders +6.5 (5u)",
      "matchup": "Bengals at Commanders",
      "market": "spread",
      "pick": "Commanders +6.5",
      "price": "-110",
      "units": "5u",
      "legs": [],
      "why": "Rested"
    },
    {
      "post_id": "9876543210",
      "url": "https://x.com/johnewing/status/9876543210",
      "handle": "johnewing",
      "author": "John Ewing",
      "posted_at": "2026-11-24T14:00:00Z",
      "kind": "note",
      "sport": "NFL",
      "text": "Bengals opened -4 now -6.5, 75% of bets / 55% of money on Bengals",
      "matchup": "Bengals at Commanders",
      "market": "spread"
    }
  ]
}
```

At most 40 items. `post_id` is the X status id (2 to 40 letters or digits). `url` is `https://x.com/.../status/...` or `https://twitter.com/.../status/...`. `handle` is `BookitWithTrent` or `johnewing` (an `@` is fine). Any other handle is rejected.

`kind` is `pick` or `note`. johnewing cannot file a pick. BookitWithTrent can file a note, and that note is stored as a note.

`sport` is `NFL`, `NBA`, `NCAAF` or `NCAAB`. `posted_at` is an ISO time, not more than 14 days old and not more than an hour ahead.

`market`, when set, is `spread`, `total`, `moneyline`, `prop`, `parlay` or `other`. A pick with more than one leg and no market is stored as a parlay. `price` is `-110`, `+200`, `EVEN` or `PK`. `units` is a number or `"5u"`, from just above 0 through 100. `legs` is a list of short strings (a parlay, or a slip). `why` is optional, one or two sentences.

Name both teams in `matchup` when you can. One nickname matches only when a single upcoming or in-progress game has that name. "Tigers" alone, with two Tiger games on the board, is not stored.

Use a plain hyphen in picks and prices. `Commanders -6.5`, not a minus sign or a dash.

## What gets stored

Each item is matched to an ESPN game with the same matcher as podcast Takes (`supabase/functions/ingest-takes/games.ts`). The list is games that have not started, plus games ESPN lists as in progress, over the next 8 days. Final games are not a match.

| Result | Meaning |
|---|---|
| `stored` | Written. A later call with the same post id and the same pick (or the same note text) updates that row |
| `duplicate` | The same post and pick, or the same post and note text, already appeared in this batch. The later copy is the one stored |
| `unmatched` | No single upcoming or in-progress game. Not stored |
| `rejected` | Bad shape, unknown handle, or a pick from the notes account. Not stored |

If ESPN returns no games, the function answers `503` and stores nothing. Send the batch again.

A successful body looks like:

```json
{
  "picks": 1,
  "notes": 1,
  "games": 48,
  "results": [
    { "post_id": "1234567890", "status": "stored", "kind": "pick", "espn_event_id": "401772941", "matchup": "Bengals at Commanders", "confidence": 0.95 },
    { "post_id": "9876543210", "status": "stored", "kind": "note", "espn_event_id": "401772941", "matchup": "Bengals at Commanders", "confidence": 0.95 }
  ]
}
```

`confidence` is `0.95` when both teams match and no other game scored, `0.9` when both match and a shorter name also hit another game, and `0.75` when only one team name matches and that game is the only one.

## Owner setup

Do not deploy this from the assistant. The owner runs migration `supabase/migrations/20261124180000_x_takes.sql`, sets `X_TAKES_INGEST_SECRET`, then deploys `ingest-x-takes` and redeploys `ingest-takes` and `app-feed`. Migration first. Steps are in `docs/mobile/OWNER_ACTIONS.md`.
