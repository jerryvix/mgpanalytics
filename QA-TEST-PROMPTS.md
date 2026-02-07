# QA Test Prompts — Feb 6-7 Changes

Test each item on both mobile (iPhone Safari) and desktop (Chrome).

---

## 1. Security Changes

### CORS Restriction
- [ ] Open browser dev tools Network tab
- [ ] Load the dashboard; chat with the bot; verify responses have `Access-Control-Allow-Origin: https://mgpanalytics.vercel.app` (not `*`)
- [ ] Verify no CORS errors appear in console

### Rate Limiting (Chat)
- [ ] Send 10+ messages rapidly in the chat (within 60 seconds)
- [ ] After 10 messages, verify you receive: "Too many requests. Please wait a moment before trying again."
- [ ] Wait 60 seconds, then confirm you can send messages again

### Sync Log RLS
- [ ] As a non-admin user, open dev tools console and run: `supabase.from('sync_log').select('*')` — should return empty or permission denied
- [ ] As admin, the same query should return rows

---

## 2. Chat Fixes

### Weather / Contextual Questions
- [ ] Ask: "What's the weather like in Kansas City for the Super Bowl?"
- [ ] Verify it returns a real answer (not "I can only answer sports questions")
- [ ] Ask: "Who has home court advantage in the NBA playoffs?"
- [ ] Verify it returns contextual information

### Super Bowl Detection
- [ ] Ask: "Who's going to win the Super Bowl?"
- [ ] Verify the response is NFL-focused (not generic)

### Chat History on Mobile
- [ ] Open Chat on mobile via the bottom nav
- [ ] Send a message to create a conversation
- [ ] Tap the History icon (clock icon in header)
- [ ] Verify the history drawer slides down showing "Recent Chats"
- [ ] Tap a past conversation to load it
- [ ] Tap "New" to start a fresh conversation

---

## 3. Mobile UI

### Sport Selector Pills
- [ ] On mobile dashboard home, verify the NFL/NBA/NCAAB pills + Setup + Refresh buttons scroll horizontally
- [ ] Verify no horizontal page overflow (no scrollbar on the whole page)
- [ ] Verify tapping a pill toggles it on/off

### Floating Nav Bar
- [ ] Verify the bottom nav bar has rounded corners and a floating effect (gap between bar and screen edge)
- [ ] Verify all 4 tabs work: Home, Sports, Chat, Community
- [ ] Verify the nav bar doesn't overlap content

### Back Buttons Removed
- [ ] Navigate to Community Feed on mobile — verify no "Back" button visible
- [ ] Navigate to Cappers Directory on mobile — verify no "Back to Feed" visible
- [ ] Navigate to NFL player page on mobile — verify no "Back to NFL Players" visible
- [ ] Navigate to NBA player page on mobile — verify no "Back" visible
- [ ] On desktop, verify all Back buttons still appear

### Cappers Access
- [ ] From Community Feed on mobile, tap the "+" button next to "Following"
- [ ] Verify it navigates to the Cappers Directory

---

## 4. Game Preview Modal (NBA)

### H2H Display
- [ ] Tap any NBA game card to open Game Preview
- [ ] Verify Head-to-Head shows which team leads, e.g. "OKC leads 1-0 this season" (not just "1-0 this season")
- [ ] If series is tied, verify it shows "Series tied 1-1 this season"
- [ ] If no meetings, verify it shows "No meetings this season"

### Last 10 Games
- [ ] In the Game Preview modal, verify the Last 10 W/L badges wrap to a second row on mobile instead of overflowing
- [ ] Verify each badge still shows tooltip on tap/hover with opponent and score

### Real Data (requires backfill)
- [ ] Verify team records show real W-L (not 0-0)
- [ ] Verify ATS and O/U show "--" with info tooltip explaining the data is being built

---

## 5. Player Detail Pages

### NFL Player Page
- [ ] Navigate to any NFL player (e.g. via Sports > NFL > Players > tap a player)
- [ ] Verify bio grid (Height/Weight/College) has compact spacing on mobile
- [ ] Verify quick stats use 3 columns on mobile (not 2)
- [ ] Verify tabs show shortened labels: "Stats", "Adv", "Log", "Betting"
- [ ] Verify tabs don't overflow or get squished

### NBA Player Page
- [ ] Navigate to any NBA player
- [ ] Verify same compact spacing improvements
- [ ] Verify tabs show: "Stats", "Adv", "Log", "Splits", "Props"
- [ ] Verify each tab loads its content properly

---

## 6. User-Facing Copy

### No Admin Panel References
- [ ] Navigate to an NBA player with no game log data
- [ ] Verify message says "Game log data will appear here once it becomes available" (NOT "Try syncing from the Admin Panel")
- [ ] Check NFL player pages similarly
- [ ] Check NBA advanced stats, splits tabs

---

## 7. Game Logs Sync (Backend)

### NBA Game Logs
- [ ] After deploying `sync-nba-game-logs`, trigger a sync via dispatch-syncs or directly
- [ ] Verify sync returns > 0 records (previously returned 0 due to wrong API endpoint)
- [ ] Check that NBA player pages now show game log data

### NFL Game Logs
- [ ] After deploying `sync-nfl-game-logs`, trigger a sync
- [ ] Verify NFL player game log tab populates with data

---

## 8. Edge Cases

- [ ] Resize browser from desktop to mobile width — verify nav transitions correctly
- [ ] Open chat on desktop, then resize to mobile — verify chat panel converts to full-screen overlay
- [ ] Rapidly toggle sport filter pills — verify no crashes or state corruption
- [ ] Open Game Preview for a team with 0 games played — verify graceful empty state
