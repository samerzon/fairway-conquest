/* Fairway Conquest (working title) — DEMO SEED DATA.
   All players, scores and courses below are FAKE demo data for the prototype. */
window.FC_SEED = {
  version: 4,
  season: { name: "Fall Season (demo)", week: 3, weeks: 8, stormCourse: "C" },
  unlocked: false,
  onboarded: false,
  me: "me",
  players: {
    me:    { id: "me",    name: "You",        short: "YOU", hcp: 8,  color: "#FF6A2B", demo: false },
    tank:  { id: "tank",  name: "Tank",       short: "TNK", hcp: 4,  color: "#2F6BFF", demo: true },
    bri:   { id: "bri",   name: "Birdie Bri", short: "BRI", hcp: 12, color: "#E5489A", demo: true },
    dee:   { id: "dee",   name: "Coach Dee",  short: "DEE", hcp: 6,  color: "#7A4DFF", demo: true },
    lou:   { id: "lou",   name: "Lefty Lou",  short: "LOU", hcp: 22, color: "#0FA595", demo: true },
    sandy: { id: "sandy", name: "Sandy M",    short: "SND", hcp: 15, color: "#E2A813", demo: true }
  },
  courses: {
    S: { id: "S", name: "Saguaro Flats",    tag: "The easy-ish one", bonus: 2, color: "#1F7A4D", tint: "#BFE3B4", free: true,
         origin: [58, 78] },
    C: { id: "C", name: "Copper Mesa",      tag: "Long, windy, mean", bonus: 4, color: "#B5532A", tint: "#F4C79E", free: false,
         origin: [178, 262] },
    D: { id: "D", name: "Sidewinder Dunes", tag: "Bunkers everywhere", bonus: 3, color: "#33546E", tint: "#B9D3E0", free: false,
         origin: [52, 448] }
  },
  // cross-course "bridges" (like the sea lanes on a classic conquest board)
  bridges: [["S9", "C1"], ["S7", "D1"], ["C7", "D3"]],
  holes: {
    // id: [par, yards, owner, strokes, troops, verified]
    S1: [4, 362, "me",   4, 2, true],
    S2: [5, 511, "me",   4, 1, true],
    S3: [3, 158, "bri",  2, 1, true],
    S4: [4, 401, "me",   4, 3, true],
    S5: [4, 377, "tank", 4, 2, true],
    S6: [3, 172, "bri",  3, 3, true],
    S7: [4, 419, "tank", 5, 1, true],
    S8: [4, 344, "me",   4, 4, true],
    S9: [5, 538, "dee",  4, 2, true],
    C1: [4, 428, "tank", 4, 3, true],
    C2: [3, 201, "tank", 3, 2, true],
    C3: [5, 566, "tank", 5, 2, true],
    C4: [5, 549, "lou",  3, 1, false],
    C5: [4, 445, "tank", 4, 4, true],
    C6: [4, 410, "tank", 3, 2, true],
    C7: [3, 188, "lou",  3, 1, true],
    C8: [4, 432, "dee",  4, 2, true],
    C9: [4, 455, "tank", 4, 3, true],
    D1: [4, 371, "dee",  4, 2, true],
    D2: [3, 149, "sandy",3, 1, true],
    D3: [4, 398, "dee",  4, 3, true],
    D4: [5, 522, "sandy",5, 2, true],
    D5: [4, 366, "dee",  3, 2, true],
    D6: [4, 389, "sandy",5, 1, true],
    D7: [3, 167, "dee",  3, 1, true],
    D8: [4, 412, "sandy",4, 2, true],
    D9: [5, 507, null,   null, 0, false]
  },
  myTroops: 6,
  tradeCount: 1,
  capturedThisWeek: false,
  cards: ["driver", "iron", "driver", "ace", "putter"],
  mulligans: 1,
  feed: [
    { t: "2h",  icon: "flag",  text: "<b>Tank</b> took <b>C6</b> with a birdie. Copper Mesa is almost his." },
    { t: "5h",  icon: "alert", text: "<b>Sandbagger alert:</b> Lefty Lou (22 hcp) eagled <b>C4</b>. Waiting on partner verify." },
    { t: "1d",  icon: "storm", text: "<b>Haboob</b> rolling into Copper Mesa. Fortifications reset Sunday." },
    { t: "1d",  icon: "shield",text: "<b>Birdie Bri</b> stacked 3 troops on <b>S6</b>." },
    { t: "2d",  icon: "flag",  text: "<b>You</b> took <b>S2</b> with a birdie on the par 5." }
  ]
};
