# Fairway Conquest (working title): first-draft prototype

A golf game where your scores win you territory. It's inspired by classic territory-conquest board games: every hole is a territory, every course is a continent, and the lowest score owns the ground.
**"Fairway Conquest" is a placeholder name.** All players, scores and courses in the prototype are **fake demo data**, and the 3 courses are fictional.

**Run it locally:** `cd /workspace/apps/golf-conquest && python3 -m http.server 8765`, then open http://localhost:8765 at phone width (390px).
There's no backend. State is saved in `localStorage`, and you can wipe it with **How to play → Reset demo data**. Screenshots are in `screens/`.

---

## The game in one page

**The board.** There are 3 fictional Scottsdale-style courses with 9 holes each, so 27 territories. Each course is a continent with a weekly bonus: Saguaro Flats +2, Sidewinder Dunes +3, Copper Mesa +4 (harder course, bigger bonus). Holes connect to the holes they touch on the map. Three "cart path" bridges link the courses (S9–C1, S7–D1, C7–D3).

**Claiming.** You post a score on a hole, and the lowest score relative to par owns it. Nobody holds an open hole yet, so any score claims it. To take a held hole you have to go **strictly lower**. **A tie goes to the defender.**

**Troops.** Each week you get troops equal to holes held ÷ 3 (minimum 3), plus the bonus for every full course you hold. You place troops on your holes to fortify them. **Every 3 troops on a hole adds +1 stroke of defense, up to +2.** Example: you hold a hole at par with 3 troops. A rival now has to make eagle (2 under) to take it, because birdie only ties the fortified number and ties go to you.

**Cards.** If you take at least one hole in a week, you draw a card. The set cards are **Driver, Iron and Putter**, and the **Ace** is wild. You can trade in 3 of a kind or one of each for bonus troops. The payout climbs with every trade, like the classic game: 4, 6, 8, 10, 12, 15, then +5 each time.

**Win.** Hold the most holes after the 8-week season. If you hold all 27 holes you win instantly (a "Grand Slam").

### The twists
- **Challenge.** You can attack a hole that touches one of yours. You bring troops from your border hole, and every 3 troops you commit cancels 1 stroke of their fort. If you win, those troops march in. If you lose, you drop 1 troop. A normal post (not a Challenge) has to beat the full fort.
- **Haboob (weekly storm).** An Arizona dust storm hits one course each week, and every fort there resets to 1 troop. The app warns you a week ahead.
- **Mulligan.** This power-up card comes from card draws. After a failed attempt, it lets you re-post that hole once.
- **Sandbagger alert.** Your expected score is about your handicap ÷ 18 over par per hole. A score roughly 2.4+ strokes better than that gets flagged (e.g., a 22-handicap making eagle). It posts as **pending** until a playing partner verifies it.
- **Honor system + partner verify.** You confirm every post on your honor. You can also pick a playing partner to verify it, and verified scores get a ✓. In the prototype, verification is simulated and nothing is sent anywhere.
- **Sim next week (demo button).** This pays out troops, rolls the next Haboob, and has the demo crew make a move. It lets you see the weekly loop in a few taps.

### Screens in the prototype
Onboarding, Home (season standings + feed), Map (hex board colored by owner, course borders, neighbor links, bridges), Hole detail sheet, Post score flow (stepper, live "takes it / tie / not enough" verdict, sandbagger alert, honor/verify), capture animation (and a "Held." miss screen with the Mulligan), Troops & Cards (fortify +/−, trade-in), Leaderboard, How to play, and the $6 unlock screen.

---

## Pricing (the $6 idea)

- **Model in the prototype:** the app is **free to download** and the free demo is **Saguaro Flats** (9 holes): post, claim, fortify, Challenge, Haboob, and the course leaderboard. **$6 one-time** unlocks the full season: all 3 courses (27 holes), cards, trade-ins and Mulligans, the season leaderboard and the Grand Slam.
- The unlock button is a **non-functional placeholder**. It charges nothing and calls no payment service. In a real build it would be an **App Store / Google Play in-app purchase**. There's also a clearly labeled "Preview unlocked (prototype only)" toggle so you can explore everything for $0.
- **Store costs:** an Apple Developer account is **$99/year**, and a Google Play developer account is **$25 one-time**.
- **Store fees** are roughly **15–30%** of each sale. It's 15% under Apple's Small Business Program and Google's equivalent for the first $1M/year, and 30% otherwise. At 15%, a $6 sale nets about **$5.10** before taxes, and at 30% about **$4.20**.
- Because the stores take a cut of every in-app sale, you can't sell the unlock through your own website checkout inside the app. That's the store rule on both iOS and Android, with some regional exceptions.

---

## Open questions for Sam

1. **$6 paid download vs. free + $6 unlock?** Free with an unlock gets far more downloads and lets people taste the game, and the stores' search and charts favor free apps. A paid download is simpler (no free tier to balance) but makes people pay before they've played. The prototype assumes free + unlock.
2. **Score verification.** Is honor + an optional partner tap enough? Should the partner be required for a capture, or only when the sandbagger flag trips? Do we want a photo of the scorecard, or GPS proof that you were at the course?
3. **Handicap fairness.** Should capture use **gross** scores (the 4-handicap usually wins) or **net**, with handicap strokes allocated by hole like real stroke index? Net is fairer but more complicated. Where does the handicap come from: self-entered, or a GHIN lookup later?
4. **Real course data later.** The demo courses are fictional. Real courses need par, yardage and stroke index per hole, which means a licensed course database or crowdsourced data, plus permission questions around course names and logos.
5. **Who's on the map?** Is it one global map per course (everyone who plays it) or private "crew seasons" with your group? Crew seasons are easier to verify and more fun to trash-talk.
6. **Season length and pacing.** Are 8 weeks and a 3-troops-per-stroke fort (capped at +2) the right numbers? Do troops need to be tuned for people who play once a week vs. 4 times?
7. **Does a hole have to be played in a real round,** or can you replay one hole over and over? The prototype assumes scores come from real rounds, one post per hole per round.
8. **Name.** "Fairway Conquest" is a placeholder. It needs a trademark check before anything public.

---
*Prototype only. Nothing is published, deployed, or connected to any account or payment service.*

---

# v2: real courses, GPS on-course mode, one-tap scoring

v1 is backed up at `/workspace/apps/golf-conquest-v1-backup/`.

## What's new
- **Sync a real course (free).** Search by course name or by town ("Scottsdale"), or tap **Find courses near me** (courses within 25 km of your GPS position). Each result shows how many holes are mapped. Picking a course pulls its `golf=hole` lines (with `ref` = hole number and `par` where tagged), plus greens, tees, fairways, bunkers and water.
- **Course map.** This view draws the real hole lines, greens, bunkers, fairways and water, with hole badges colored by who owns each hole in the game. Tap a badge to play that hole.
- **Territory board from the real course.** There's one hex per real hole, placed to keep the course's real geography. The Front 9 and Back 9 are the two "continents." Holes that sit next to each other are neighbors, and consecutive holes that don't touch get a dashed cart-path link. Rivals on real courses are **demo players** and labeled as such. Claim and capture rules are unchanged.
- **GPS on-course mode (Play tab).**
  - It uses `navigator.geolocation.watchPosition` with high accuracy, and shows GPS accuracy as ±m.
  - **Auto hole detection:** the current hole is the nearest hole line (standing on a tee box counts extra). Hysteresis keeps it from flickering: a new hole has to be at least 25 m closer for 3 GPS fixes in a row. An **AUTO** chip plus a 1–18 hole strip let you override it by hand.
  - **Yardages** to the **front / center / back** of the green, measured along the line from you to the green's center through the green polygon. With no GPS fix, the numbers are measured from the tee.
  - **Tap the map to measure:** you → tap point → green.
  - The current hole is drawn rotated so the tee is at the bottom and the green at the top, with 100/150/200/250 arcs.
  - A **Simulate GPS** toggle walks a fake position down the real hole lines and on to the next tee, so you can test it off the course.
- **One-tap scoring.** A big −/+ and **Post** for the current hole goes straight into the territory game, with the same capture animation. The app **auto-advances** when GPS puts you on the next hole. You get a "Thru N · ±" running total, and partner verify is optional (tap to cycle through partners).
- **Outdoor mode** (sun button) switches to black-on-white with thicker strokes and bigger numbers, for reading in Arizona sun.
- **Missing data is handled plainly.** If a course has no mapped holes, the app says so. It then offers **set up 9/18 holes by hand** (territory game + score entry, no yardages) or **play the demo board**. **Edit pars** lets you fix any par: each one is marked OSM, Guess (from hole length) or You.
- **$6 unlock** is still a placeholder. Free = course sync + GPS yardages on all holes + the Front 9 territory game. $6 = all 18 on every course, cards and power-ups, and the season leaderboard.

## Data sources and attribution
- **OpenStreetMap** supplies the course outlines, holes, greens, tees, fairways, bunkers and water. Map data is **© OpenStreetMap contributors**, available under the **Open Database License (ODbL)**. The app shows this attribution on the course map, the hole map, the territory board, the Courses screen and How to play, and links to https://www.openstreetmap.org/copyright.
- **Nominatim** (nominatim.openstreetmap.org) handles name and place search. The app follows its usage policy:
  - It only searches when you submit, with no autocomplete.
  - Requests are throttled to at most 1 per second.
  - Results are cached in localStorage for 14 days.
  - Browsers don't allow a custom User-Agent, so the page's Referer identifies the app.
- **Overpass API** (overpass-api.de, with overpass.private.coffee and overpass.kumi.systems as fallbacks) supplies course lists and geometry. Queries use simple form POSTs, so there's no CORS preflight. All three endpoints return `Access-Control-Allow-Origin: *` (checked). Results are cached in localStorage (course geometry 30 days, nearby lists 7 days), and the app retries with backoff when the servers are busy.
- **Bundled snapshot:** `data/way-78388948.json` (TPC Scottsdale Stadium) and `data/way-61499695.json` (Camelback) are raw OSM extracts from 2026-10-23, with the same ODbL attribution. The app falls back to them if Overpass can't be reached.

## Limits
- **Coverage varies by course.** Some courses have every hole, green and bunker mapped. Some have only an outline. Pars are often missing (we guess them from length and you can edit them). Front/back yardages need a mapped green polygon.
- **The public Overpass servers are free and often overloaded.** First-time searches and syncs can take anywhere from seconds to a few minutes on a bad day. After that they're instant from the cache.
- **36-hole clubs** without course tags are split into "Loop A / Loop B" by chaining holes. You pick the right one, and the names may not match the club's.
- **Phone GPS** is typically accurate to ±3–10 m. It doesn't account for elevation, hazards-to-carry, or pin position (center of green only).
- **localStorage** holds about 5 MB, which is plenty for a handful of synced courses.

## A real app later (if we need better course data)
OSM is free and good in many golf-heavy areas, but it's incomplete. A real app could:
1. Keep OSM as the free base layer.
2. Let golfers fix pars and greens in-app and contribute them back to OSM.
3. Add a **licensed course database** for guaranteed coverage. Commercial golf GPS/course-data APIs sell hole-by-hole geometry, green front/center/back points, hazards and scorecards for tens of thousands of courses. They're typically priced per course or per API call, or by subscription, and their licenses usually forbid caching beyond their terms. That cost would come out of the $6 unlock revenue, so it's worth checking whether OSM coverage in the target areas is good enough first.

## Scottsdale-area coverage (checked 2026-10-23 via Overpass)
I checked 71 golf courses in the Scottsdale / east Phoenix area: **34 have 18 or more holes mapped, 11 are partial (1–17 holes), and 26 have none.**
- **Full 18, tested end-to-end in the app:**
  - **TPC Scottsdale Stadium Course:** 18 holes, all pars, 25 greens, 75 bunkers. I tested search, sync, the course map, GPS, yardages, scoring and the territory board.
  - **Camelback Golf Club:** 36 holes. "Loop A" has all its pars. "Loop B" has none, so they're guessed and editable.
- **Full 18 mapped (should work the same, not individually tested):** TPC Scottsdale Champions, Troon North (36), McCormick Ranch (36), Talking Stick (36), We-Ko-Pa (36), Grayhawk Talon, Grayhawk Raptor, Silverleaf, The Boulders, Desert Highlands, Pinnacle Peak CC, McDowell Mountain, Whisper Rock, The Estancia Club, Mirabel, Papago, Silverado, Arizona Country Club, Arizona Biltmore Links and Estates, SunRidge Canyon, FireRock, Desert Canyon, Eagle Mountain, Orange Tree, Dove Valley Ranch, Apache Wells, Longbow, Saguaro and Cholla (We-Ko-Pa).
- **Kierland** has 26 holes mapped (18 plus part of its third nine).
- **Partial:** Legend Trail (17), Ironwood & Acacia (17), The Phoenician (12), Mountain Shadows (12), Royal Palms (9), Mesquite (7), Continental (1), DC Ranch (1), Tonto Verde Peaks (1).
- **No holes mapped** (tested: the app says "No holes mapped yet" and offers by-hand setup): Gainey Ranch, Starfire, Ancala, Troon CC, Terravita, Wildfire, Coronado, Scottsdale Shadows, Paradise Valley CC, Tatum Ranch, Red Mountain Ranch, Verde River, Desert Forest, Rio Verde CC.

## Running v2 / sharing a link
- **Local:** `python3 /workspace/tools/fc_server.py 8817`, then open http://127.0.0.1:8817 (a localhost origin counts as secure, so GPS works in a desktop browser).
- **Phone link:** GPS needs HTTPS. The plan was a free Cloudflare quick tunnel: `cloudflared tunnel --url http://localhost:8817` gives a temporary `*.trycloudflare.com` HTTPS URL, which changes whenever the tunnel restarts. **This box's network blocks the tunnel.** Cloudflare's edge needs outbound port 7844 (QUIC/TCP), and that port is closed here, so the URL it prints returns HTTP 530. To get a phone link from any normal Mac/PC on home Wi-Fi:
  1. Unzip `golf-conquest-v2.zip`.
  2. Run `python3 -m http.server 8817` inside the folder.
  3. In a second terminal, run `cloudflared tunnel --url http://localhost:8817` (free download, no account).
  4. Open the printed `https://….trycloudflare.com` link on the phone. It's temporary and changes on every restart.
- **Permanent free link later:** GitHub Pages or Cloudflare Pages (both free, both need a free account). This is a static folder, so nothing needs to change.
