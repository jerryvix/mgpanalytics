// Takes sources (DECISIONS D-059, D-060): outside shows and personalities the
// owner picked (Bookit Blitz dropped Nov 23: video only; Daft Previews added Nov 24,
// read from its video descriptions, which list its picks). They are not MGP's insiders; their picks are theirs, shown
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
  podcast?: { applePodcastsId: string; feed: string };
  /**
   * The show's key in `takes` when its picks are read from each video's title and
   * description alone (scripts/takes/youtube_text.py); only for shows whose
   * descriptions list the picks themselves
   */
  descriptionPicks?: string;
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
    podcast: { applePodcastsId: "1704233690", feed: "https://feeds.megaphone.fm/bearbets" },
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
    podcast: { applePodcastsId: "1760085357", feed: "https://feeds.megaphone.fm/holdthephone" },
  },
  {
    channelId: "UCZmtXolnY7-z9HLiBESjkyQ",
    handle: "@SportsLine",
    name: "The Early Edge (SportsLine, CBS Sports)",
    x: "SportsLine",
    // Hosts named in the show's descriptions (Nov 23 2026); X handles not yet confirmed.
    // Daily on weekdays at 10 a.m. ET: NFL, college football, NBA, college basketball, MLB, NHL, soccer.
    people: [
      { name: "Sia Nejad" },
      { name: "Buckets" },
      { name: "Bob Konarski" },
      { name: "Martin Green" },
      { name: "Mike Barner" },
    ],
    podcast: { applePodcastsId: "1543098312", feed: "https://rss.amperwave.net/v2/feed/audacynetwork/earlyedge" },
  },
  {
    // YouTube only (Nov 24 2026). Daily NBA player props: each description lists the picks
    // ("Pick 1: Devin Booker over 5.5 assists") and chapters, with no prices and no host
    // named. Instagram: daftpreviews; site daftpreviews.com. The X handle comes from a web
    // search, not the descriptions, so it is unverified.
    channelId: "UCwvzzWorj_-_d792FUo3gmg",
    handle: "@daftpreviews",
    name: "Daft Previews",
    x: "daft_previews",
    people: [],
    descriptionPicks: "daft-previews",
  },
  // Final Round Sports (@Final_Round_Sports, UCyHwy6GwBufcf84tqNXj86w) was checked the same
  // day and left out: its descriptions name the matchups and say the plays are in a pinned
  // comment, which the public feed doesn't carry. Socials there: X thefinalround11, a
  // Discord, Cash App and Venmo finalround11, promo code FRS; no host named.
];

export const youtubeFeedUrl = (channelId: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
