// Insiders sources (DECISIONS D-059): betting shows the owner picked, read
// from YouTube's free public per-channel feed (no API key):
//   https://www.youtube.com/feeds/videos.xml?channel_id=<channelId>
// Each feed returns the channel's 15 latest uploads (title, link, published).
// Show headline plus link only, credited to the show; never copy content.
// Verified Nov 23 2026: all three feeds returned 15 entries.

export interface InsiderSource {
  /** YouTube channel ID (UC…), the key the feed takes */
  channelId: string;
  /** The @handle, for building links and for people reading this list */
  handle: string;
  /** Display name, as the channel titles itself */
  name: string;
}

export const INSIDER_SOURCES: readonly InsiderSource[] = [
  { channelId: "UCxK3DFiD_LrvYTYQaTnDiYw", handle: "@bearbetspod", name: "Bear Bets: A FOX Sports Gambling Show" },
  { channelId: "UCsyYwtlAzNCsCk2uLa4B1Cg", handle: "@HoldthePhoneShow", name: "Hold The Phone" },
  { channelId: "UCOJq3FrHd0TBxrUZEEm4vtw", handle: "@BookitBlitz", name: "Bookit Blitz" },
];

export const youtubeFeedUrl = (channelId: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
