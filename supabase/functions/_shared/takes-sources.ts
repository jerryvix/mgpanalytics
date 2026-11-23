// Takes sources (DECISIONS D-059, D-060): outside shows and personalities the
// owner picked. They are not MGP's insiders; their picks are theirs, shown
// credited by name with a link to the original. MGP itself gives no picks.
//
// Feed: YouTube's free public per-channel feed (no API key), which returns the
// 15 latest uploads with title, link, published date and description:
//   https://www.youtube.com/feeds/videos.xml?channel_id=<channelId>
// Video pages themselves are off limits (YouTube answers automated visits with
// a captcha, and its terms forbid scraping them).
//
// Handles come from the shows' own video descriptions (Nov 23 2026). The
// platform for each is noted where the description made it clear; X accounts
// could not be checked from here (no X access), so `x` values are unverified.

export interface TakesPerson {
  name: string;
  /** X handle without @, when known */
  x?: string;
}

export interface TakesSource {
  /** YouTube channel ID (UC…), the key the feed takes */
  channelId: string;
  /** The show's YouTube @handle */
  handle: string;
  /** Display name, as the channel titles itself */
  name: string;
  /** The show's own X handle, when known */
  x?: string;
  /** Regular hosts and contributors named in the show's descriptions */
  people: TakesPerson[];
  /** Official podcast feed, when the show publishes audio (lets us find spoken picks) */
  podcast?: { applePodcastsId: string };
}

export const TAKES_SOURCES: readonly TakesSource[] = [
  {
    channelId: "UCxK3DFiD_LrvYTYQaTnDiYw",
    handle: "@bearbetspod",
    name: "Bear Bets: A FOX Sports Gambling Show",
    x: "bearbetspod",
    people: [
      { name: "Chris “The Bear” Fallica", x: "chrisfallica" },
      { name: "Geoff Schwartz", x: "geoffschwartz" },
      { name: "Sammy Panayotovich", x: "spshoot" },
      { name: "Will Hill" },
      { name: "Bruce Feldman" },
    ],
    podcast: { applePodcastsId: "1704233690" },
  },
  {
    channelId: "UCsyYwtlAzNCsCk2uLa4B1Cg",
    handle: "@HoldthePhoneShow",
    name: "Hold The Phone",
    // Descriptions mention holdthe_phone, holdthephoneshow, whosnextsports and
    // the hosts' doctorlocks.md and glue.guy; which of these are X accounts is unconfirmed.
    x: "holdthe_phone",
    people: [],
    // Almost Friday Media, presented by BetMGM
    podcast: { applePodcastsId: "1760085357" },
  },
  {
    channelId: "UCOJq3FrHd0TBxrUZEEm4vtw",
    handle: "@BookitBlitz",
    name: "Bookit Blitz",
    // Descriptions mention bookitsports and BookitHQ; video descriptions are otherwise empty.
    // No podcast feed found (Nov 23 2026): video only, so picks can't be captured automatically.
    x: "bookitsports",
    people: [],
  },
];

export const youtubeFeedUrl = (channelId: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
