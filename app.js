/* Fairway Conquest (working title) — clickable prototype. No backend, state lives in localStorage. */
(() => {
  const KEY = "fairwayConquest.state";
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view"), sheetRoot = $("#sheet-root"), overlayRoot = $("#overlay-root"), tabbar = $("#tabbar");
  const SQ3 = Math.sqrt(3), R = 30, HEX = 24;
  const MAX_TROOPS = 6, MAX_BUFFER = 2;
  const SET_VALUES = [4, 6, 8, 10, 12, 15];

  // ---------- state ----------
  function fresh() {
    const s = JSON.parse(JSON.stringify(window.FC_SEED));
    const holes = {};
    for (const [id, [par, yards, owner, strokes, troops, verified]] of Object.entries(s.holes))
      holes[id] = { id, par, yards, owner, strokes, troops, verified };
    s.boards = { demo: { key: "demo", kind: "demo", name: "Demo board (fictional courses)", courses: s.courses, holes, bridges: s.bridges, storm: s.season.stormCourse } };
    delete s.courses; delete s.holes; delete s.bridges; delete s.season.stormCourse;
    s.active = "demo"; s.outdoor = false; s.round = {}; s.partner = "none"; s.units = "yd";
    return s;
  }
  let S;
  /** S.holes / S.courses / S.bridges / S.season.stormCourse always point at the active board (not serialized twice). */
  function bindState() {
    const B = () => S.boards[S.active] || S.boards.demo;
    for (const k of ["holes", "courses", "bridges"]) Object.defineProperty(S, k, { get: () => B()[k], configurable: true, enumerable: false });
    Object.defineProperty(S.season, "stormCourse", { get: () => B().storm, set: v => { B().storm = v; }, configurable: true, enumerable: false });
  }
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || S.version !== window.FC_SEED.version) S = fresh();
  bindState();
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
  const board = () => S.boards[S.active] || S.boards.demo;
  save();

  // ---------- rules helpers ----------
  const P = id => S.players[id];
  const course = id => S.courses[id[0]];
  const num = id => id.slice(1);
  const rel = h => h.strokes == null ? null : h.strokes - h.par;
  const relTxt = r => r == null ? "—" : r === 0 ? "E" : r > 0 ? "+" + r : "" + r;
  const buffer = h => Math.min(MAX_BUFFER, Math.floor((h.troops || 0) / 3));
  const locked = id => !S.unlocked && !course(id).free;
  const scoreName = (strokes, par) => {
    const d = strokes - par;
    if (strokes === 1) return "Ace";
    return ({ "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Double" })[d] || (d < -3 ? "Unreal" : "Triple+");
  };
  const sandbagger = (r, hcp) => r <= hcp / 18 - 2.4;

  function center(id) {
    const hh = S.holes[id]; if (hh && hh.pos) return hh.pos;
    const c = course(id), i = +num(id) - 1, row = Math.floor(i / 3);
    const col = row % 2 === 0 ? i % 3 : 2 - (i % 3);
    const w = SQ3 * R;
    return [c.origin[0] + col * w + (row % 2) * w / 2, c.origin[1] + row * 1.5 * R];
  }
  let adjCache = { key: null, map: null };
  function adjMap() {
    if (adjCache.key === S.active && adjCache.map) return adjCache.map;
    const ADJ = {}, ids = Object.keys(S.holes), any = board().kind !== "demo";
    ids.forEach(a => ADJ[a] = new Set());
    for (const a of ids) for (const b of ids) {
      if (a >= b || (!any && a[0] !== b[0])) continue;
      const [x1, y1] = center(a), [x2, y2] = center(b);
      if (Math.hypot(x1 - x2, y1 - y2) < SQ3 * R * 1.1) { ADJ[a].add(b); ADJ[b].add(a); }
    }
    for (const [a, b] of S.bridges) { if (ADJ[a] && ADJ[b]) { ADJ[a].add(b); ADJ[b].add(a); } }
    adjCache = { key: S.active, map: ADJ };
    return ADJ;
  }
  const neighbors = id => [...(adjMap()[id] || [])].sort((a, b) => a[0] === b[0] ? +a.slice(1) - +b.slice(1) : a.localeCompare(b));

  function counts() {
    const c = {}; Object.keys(S.players).forEach(p => c[p] = 0);
    Object.values(S.holes).forEach(h => h.owner && c[h.owner]++);
    return c;
  }
  function continentsOf(pid) {
    return Object.keys(S.courses).filter(cid => Object.values(S.holes).filter(h => h.id[0] === cid).every(h => h.owner === pid));
  }
  function courseCount(pid, cid) { return Object.values(S.holes).filter(h => h.id[0] === cid && h.owner === pid).length; }
  function income(pid = "me") {
    const n = counts()[pid], base = Math.max(3, Math.floor(n / 3));
    const conts = continentsOf(pid), bonus = conts.reduce((a, c) => a + S.courses[c].bonus, 0);
    return { n, base, conts, bonus, total: base + bonus };
  }
  function standings() {
    const c = counts();
    return Object.values(S.players).map(p => ({ ...p, n: c[p.id], troops: Object.values(S.holes).filter(h => h.owner === p.id).reduce((a, h) => a + h.troops, 0), conts: continentsOf(p.id) }))
      .sort((a, b) => b.n - a.n || b.troops - a.troops);
  }
  const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
  const nextSetValue = () => SET_VALUES[S.tradeCount] ?? (15 + 5 * (S.tradeCount - 5));

  /** Target to beat: you need rel strictly below (holder rel - effective buffer). */
  function needToTake(h, cancel = 0) {
    if (!h.owner) return null;
    const eff = Math.max(0, buffer(h) - cancel);
    const target = rel(h) - eff;            // tie at target goes to defender
    return { eff, target, strokes: h.par + target - 1 };
  }

  // ---------- svg helpers ----------
  function hexPts(cx, cy, r) {
    const p = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); p.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1)); }
    return p.join(" ");
  }
  const ownerColor = h => h.owner ? P(h.owner).color : "#E6D6B4";
  function hexSvg(color, label, opts = {}) {
    const { sub = "", stroke = "#fff", w = 74, h = 80 } = opts;
    return `<svg viewBox="0 0 100 108" width="${w}" height="${h}" class="${opts.cls || ""}">
      <defs><linearGradient id="g${label}${color.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${hexPts(50, 56, 47)}" fill="rgba(0,0,0,.25)"/>
      <polygon points="${hexPts(50, 52, 47)}" fill="${color}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="${hexPts(50, 52, 47)}" fill="url(#g${label}${color.slice(1)})"/>
      <text x="50" y="${sub ? 58 : 64}" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="${sub ? 30 : 36}" fill="#fff">${label}</text>
      ${sub ? `<text x="50" y="80" text-anchor="middle" font-family="Bricolage" font-weight="700" font-size="13" fill="#fff" opacity=".85">${sub}</text>` : ""}
    </svg>`;
  }
  const ICONS = {
    flag: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
    storm: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    swords: '<path d="M4 4l9 9M4 4v4M4 4h4M20 4l-9 9M20 4v4M20 4h-4M7 17l-3 3M17 17l3 3M9 15l-2 2M15 15l2 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    map: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cards: '<rect x="3" y="4" width="11" height="15" rx="2"/><path d="M17 6l3.5 1.5-4.5 12-4-1.6"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
    redo: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 4v4.5h4.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  const ic = (n, color = "currentColor", extra = "") => `<svg viewBox="0 0 24 24" style="stroke:${color};fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" ${extra}>${ICONS[n]}</svg>`;
  const shieldsHtml = (b) => `<span class="shields">${[0, 1].map(i => `<svg viewBox="0 0 24 26"><path d="M12 2l9 3.5v7c0 6-4 9.5-9 11.5-5-2-9-5.5-9-11.5v-7z" fill="${i < b ? "#FFB13B" : "rgba(255,240,220,.12)"}" stroke="${i < b ? "#ffe2a8" : "rgba(255,240,220,.2)"}" stroke-width="1.5"/></svg>`).join("")}</span>`;
  const avatar = (p, size = "") => `<div class="avatar" style="background:${p.color};${size}">${p.short}</div>`;
  const demoChip = `<span class="chip demo">Demo data</span>`;

  const CARD_ART = {
    driver: '<ellipse cx="62" cy="52" rx="26" ry="16" fill="#123a66"/><ellipse cx="58" cy="48" rx="20" ry="9" fill="#2f6bb8"/><path d="M40 46L14 6" stroke="#123a66" stroke-width="5" stroke-linecap="round"/><circle cx="22" cy="62" r="6" fill="#fff"/>',
    iron: '<path d="M44 40l26 4c4 1 5 6 2 9L56 66c-4 3-12 2-14-3l-4-14z" fill="#0f4d2c"/><path d="M48 44l18 3" stroke="#bfe9cf" stroke-width="2"/><path d="M42 42L22 4" stroke="#0f4d2c" stroke-width="5" stroke-linecap="round"/><circle cx="76" cy="64" r="6" fill="#fff"/>',
    putter: '<rect x="36" y="50" width="42" height="12" rx="4" fill="#6b2e0d"/><path d="M48 50L34 6" stroke="#6b2e0d" stroke-width="5" stroke-linecap="round"/><circle cx="22" cy="58" r="6" fill="#fff"/><ellipse cx="80" cy="68" rx="9" ry="3" fill="#6b2e0d" opacity=".5"/>',
    ace: '<ellipse cx="50" cy="62" rx="34" ry="9" fill="#7a1d33" opacity=".35"/><path d="M50 62V8" stroke="#5a1222" stroke-width="3.5" stroke-linecap="round"/><path d="M51 9h26l-7 9 7 9H51z" fill="#fff"/><text x="62" y="23" font-family="Unbounded" font-weight="900" font-size="12" fill="#c8243f" text-anchor="middle">1</text><circle cx="50" cy="62" r="5" fill="#5a1222"/>',
    mull: '<path d="M30 40a20 20 0 1 0 6-14" fill="none" stroke="#2b1466" stroke-width="7" stroke-linecap="round"/><path d="M26 14l10 12-14 3z" fill="#2b1466"/><circle cx="50" cy="40" r="6" fill="#fff"/>'
  };
  const CARD_NAMES = { driver: "Driver", iron: "Iron", putter: "Putter", ace: "Ace", mull: "Mulligan" };
  const CARD_FOOT = { driver: "Set card", iron: "Set card", putter: "Set card", ace: "Wild", mull: "Re-post a hole" };
  const cardHtml = (t, i, sel) => `<button class="gcard ${t} ${sel ? "sel" : ""}" data-card="${i}"><span class="ctype">${CARD_NAMES[t]}</span>
    <svg class="cart" viewBox="0 0 100 76">${CARD_ART[t]}</svg><span class="cfoot">${CARD_FOOT[t]}</span><span class="check">${ic("check")}</span></button>`;

  // ---------- toast ----------
  let toastT;
  function toast(msg) { const t = $("#toast"); t.innerHTML = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

  // ---------- topbar ----------
  function topbar() {
    return `<header class="topbar"><div class="brand"><div class="brand-mark"><svg viewBox="0 0 24 24"><path d="M7 21V3l11 4.5L9 12"/><path d="M7 21V3" stroke="#1b0f08" stroke-width="2.6" fill="none"/></svg></div>
      <div class="brand-name">Fairway Conquest<small>WORKING TITLE · PROTOTYPE</small></div></div>
      <div class="top-actions">${S.unlocked ? "" : `<a href="#unlock" class="lock-pill">${ICONS.lock ? ic("lock") : ""}$6</a>`}<a class="icon-btn" href="#how" aria-label="How to play">${ic("help")}</a></div></header>`;
  }

  // ---------- HOME ----------
  function renderHome() {
    const st = standings(), meIdx = st.findIndex(p => p.id === "me"), me = st[meIdx], inc = income();
    const max = Math.max(...st.map(p => p.n));
    const stormC = S.courses[S.season.stormCourse];
    const feedIc = { flag: ["flag", "#FF6A2B"], alert: ["alert", "#F2577A"], storm: ["storm", "#E7CFA4"], shield: ["shield", "#FFB13B"] };
    view.innerHTML = `<div class="screen">${topbar()}
      <section class="hero">
        <div class="eyebrow" style="color:#ffe2a8">${S.season.name} · Week ${S.season.week}/${S.season.weeks}</div>
        <div class="rank">${meIdx + 1}<sup>${ord(meIdx + 1).replace(/\d+/, "")}</sup></div>
        <p>${meIdx === 0 ? "You're on top. Act like you've been there." : `${st[0].name} is ${st[0].n - me.n} holes up. Go get 'em.`}</p>
        <div class="hero-stats">
          <div class="hero-stat"><b>${me.n}</b><span>Holes</span></div>
          <div class="hero-stat"><b>${S.myTroops}</b><span>Troops</span></div>
          <div class="hero-stat"><b>${S.cards.length}</b><span>Cards</span></div>
        </div>
        <svg class="hero-hex" viewBox="0 0 120 110">${[[38, 34, "#FF6A2B"], [82, 34, "#FFB13B"], [60, 72, "#F3E2C2"]].map(([x, y, c]) => `<polygon points="${hexPts(x, y, 24)}" fill="${c}" stroke="rgba(255,255,255,.7)" stroke-width="2.5"/>`).join("")}
          <path d="M60 60V38" stroke="#1b0f08" stroke-width="3" stroke-linecap="round"/><path d="M61 38h14l-4 5 4 5H61z" fill="#1b0f08"/></svg>
      </section>
      <div class="storm"><div class="storm-ic">${ic("storm")}</div><div><b>Haboob hits ${stormC.name}</b><span>Every fort there resets Sunday. Strike now.</span></div></div>
      <a class="course-card" href="${board().kind === "demo" ? "#courses" : "#play"}"><div class="cc-ic">${ic(board().kind === "demo" ? "map" : "flag", "#1b0f08")}</div>
        <div class="who"><span class="eyebrow" style="font-size:10px">${board().kind === "demo" ? "Playing the demo board" : "Your course"}</span><b>${board().kind === "demo" ? "Sync your real course" : esc(shortName(board().name))}</b><span>${board().kind === "demo" ? "Any course on OpenStreetMap · GPS yardages" : `${Object.keys(S.holes).length} holes · GPS on-course mode`}</span></div><svg class="chev" viewBox="0 0 24 24" width="22" height="22" style="stroke:#6b4a26;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round"><path d="M9 5l7 7-7 7"/></svg></a>
      <div class="cta-row"><a class="btn primary" style="flex:1.3" href="#map">${ic("map")}Open the map</a><a class="btn ghost" style="flex:1" href="#how">How to play</a></div>
      <div class="section-head"><h2 class="h2">Season standings</h2>${demoChip}</div>
      <div class="standings">${st.map((p, i) => `<div class="row ${p.id === "me" ? "me" : ""}"><div class="pos">${i + 1}</div>${avatar(p)}
        <div class="who"><b>${p.name}${p.conts.map(c => `<span class="cbadge" style="background:${S.courses[c].color}">${S.courses[c].name.split(" ")[0].toUpperCase()}</span>`).join("")}</b><span>${p.hcp} hcp · ${p.troops} troops on the board</span>
        <div class="bar"><i style="width:${(p.n / max) * 100}%;background:${p.color};animation-delay:${i * 60}ms"></i></div></div>
        <div class="terr"><b>${p.n}</b><span>holes</span></div></div>`).join("")}</div>
      <div class="section-head"><h2 class="h2">Clubhouse chatter</h2><span class="muted" style="font-size:12px">Demo feed</span></div>
      <div class="feed">${S.feed.slice(0, 6).map(f => `<div class="feed-item"><div class="feed-ic">${ic(feedIc[f.icon][0], feedIc[f.icon][1])}</div><div>${f.text}</div><time>${f.t}</time></div>`).join("")}</div>
      <p class="fineprint">Prototype. Rival players and their scores are fake demo data. ${board().kind === "demo" ? "The demo board's courses are fictional." : `Course layout from OpenStreetMap (© OpenStreetMap contributors, ODbL).`}</p>
    </div>`;
    if (!S.onboarded) showOnboarding();
  }

  function showOnboarding() {
    overlayRoot.innerHTML = `<div class="onb"><div class="onb-sun"></div>
      <svg class="onb-hills" viewBox="0 0 390 300" preserveAspectRatio="none"><path d="M0 120 Q60 70 120 110 T240 95 T390 100 V300 H0z" fill="#8a3a18"/><path d="M0 170 Q90 120 180 160 T390 150 V300 H0z" fill="#5c2410"/>
      <g fill="#2a140a"><path d="M300 150v-46a7 7 0 0 1 14 0v46zM292 128v-14a5 5 0 0 1 10 0v14h-4v-10zM312 120v-10a5 5 0 0 1 10 0v18h-10z"/><path d="M70 175v-34a5 5 0 0 1 10 0v34zM64 160v-9a4 4 0 0 1 8 0v9z"/></g></svg>
      <div class="onb-card"><div class="eyebrow">Fairway Conquest · working title</div><h1 class="h1">Own the course.<br>One hole at a time.</h1>
        <p>Every hole is territory. Post the lowest score and it's yours. Hold a whole course for bonus troops.</p>
        <div class="onb-steps"><div class="onb-step"><i>1</i>Shoot a hole lower than the holder.</div><div class="onb-step"><i>2</i>Stack troops so they need to beat you by more.</div><div class="onb-step"><i>3</i>Most holes at season's end wins.</div></div>
        <button class="btn primary block" id="onb-go">Let's go</button><div class="sub">Demo crew and scores are fake. Nothing leaves your phone.</div></div></div>`;
    $("#onb-go").onclick = () => { S.onboarded = true; save(); overlayRoot.innerHTML = ""; };
  }

  // ---------- MAP ----------
  let selected = null, pulseId = null;
  function boardSvg() {
    const holes = Object.values(S.holes);
    let land = "", terr = "", links = "", bridges = "", labels = "", veils = "";
    for (const c of Object.values(S.courses)) {
      const ids = holes.filter(h => h.id[0] === c.id).map(h => h.id);
      land += ids.map(id => { const [x, y] = center(id); return `<polygon points="${hexPts(x, y + 3, R + 9)}" fill="rgba(90,60,30,.18)"/>`; }).join("");
      land += ids.map(id => { const [x, y] = center(id); return `<polygon points="${hexPts(x, y, R + 9)}" fill="${c.color}"/>`; }).join("");
      land += ids.map(id => { const [x, y] = center(id); return `<polygon points="${hexPts(x, y, R + 5.5)}" fill="${c.tint}"/>`; }).join("");
    }
    const LABELS = board().kind === "demo" ? { S: [36, 22, "start"], C: [338, 202, "end"], D: [36, 576, "start"] } : null;
    for (const c of Object.values(S.courses)) {
      if (!LABELS) { if (locked(c.id + Object.values(S.holes).find(h => h.id[0] === c.id).id.slice(1))) {
          const ids = holes.filter(h => h.id[0] === c.id).map(h => h.id);
          const cx = ids.reduce((a, id) => a + center(id)[0], 0) / ids.length, cy = ids.reduce((a, id) => a + center(id)[1], 0) / ids.length;
          veils += `<g class="locked-veil">${ids.map(id => { const [x, y] = center(id); return `<polygon points="${hexPts(x, y, R + 9.5)}" fill="rgba(245,229,198,.72)"/>`; }).join("")}
            <g transform="translate(${cx - 46},${cy - 20})"><rect width="92" height="40" rx="20" fill="#1b0f08"/><g transform="translate(14,10)" stroke="#FFB13B" stroke-width="2.4" fill="none" stroke-linecap="round"><rect x="1" y="8" width="16" height="11" rx="3"/><path d="M4.5 8V5.5a4.5 4.5 0 0 1 9 0V8"/></g><text x="58" y="25" text-anchor="middle" font-size="12" font-weight="800" fill="#FFB13B">$6</text></g></g>`; }
        continue; }
      const [lx, ly, anchor] = LABELS[c.id], held = continentsOf("me").includes(c.id);
      const storm = S.season.stormCourse === c.id;
      const wpx = c.name.length * 8.3 + 56;
      const x0 = anchor === "end" ? lx - wpx : lx;
      labels += `<g><rect x="${x0}" y="${ly}" rx="11" width="${wpx}" height="24" fill="${c.color}"/>
        <text x="${x0 + 10}" y="${ly + 16}" font-size="10.5" font-weight="800" fill="#fff" style="letter-spacing:.02em">${c.name.toUpperCase()}</text>
        <rect x="${x0 + wpx - 34}" y="${ly + 4}" rx="7" width="30" height="16" fill="rgba(255,255,255,.22)"/><text x="${x0 + wpx - 19}" y="${ly + 15.5}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">+${c.bonus}</text>
        ${storm ? `<g transform="translate(${anchor === "end" ? x0 - 30 : x0 + wpx + 6},${ly - 2})"><circle cx="12" cy="14" r="13" fill="#E7CFA4" stroke="#b08a5a" stroke-width="1.5"/><path d="M5 11h9a2.5 2.5 0 1 0-2.5-2.5M5 14.5h12a2.5 2.5 0 1 1-2.5 2.5M5 18h5" stroke="#6b4a26" stroke-width="2" fill="none" stroke-linecap="round"/></g>` : ""}</g>`;
      if (locked(c.id + "1")) {
        const ids = holes.filter(h => h.id[0] === c.id).map(h => h.id);
        const cx = ids.reduce((a, id) => a + center(id)[0], 0) / 9, cy = ids.reduce((a, id) => a + center(id)[1], 0) / 9;
        veils += `<g class="locked-veil">${ids.map(id => { const [x, y] = center(id); return `<polygon points="${hexPts(x, y, R + 9.5)}" fill="rgba(245,229,198,.72)"/>`; }).join("")}
          <g transform="translate(${cx - 46},${cy - 20})"><rect width="92" height="40" rx="20" fill="#1b0f08"/><g transform="translate(14,10)" stroke="#FFB13B" stroke-width="2.4" fill="none" stroke-linecap="round"><rect x="1" y="8" width="16" height="11" rx="3"/><path d="M4.5 8V5.5a4.5 4.5 0 0 1 9 0V8"/></g>
          <text x="58" y="25" text-anchor="middle" font-size="12" font-weight="800" fill="#FFB13B">$6</text></g></g>`;
      }
    }
    const seen = new Set();
    const ADJ = adjMap();
    for (const a of Object.keys(ADJ)) for (const b of ADJ[a]) {
      const k = [a, b].sort().join("-"); if (seen.has(k)) continue; seen.add(k);
      const [x1, y1] = center(a), [x2, y2] = center(b);
      if (S.bridges.some(([p, q]) => (p === a && q === b) || (p === b && q === a)) || (board().kind === "demo" && a[0] !== b[0])) { bridges += `<path class="bridge" d="M${x1} ${y1} Q ${(x1 + x2) / 2 + (y2 - y1) * .18} ${(y1 + y2) / 2 - (x2 - x1) * .18} ${x2} ${y2}"/>`; continue; }
      const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d, s = 15, e = d - 15;
      links += `<line x1="${x1 + ux * s}" y1="${y1 + uy * s}" x2="${x1 + ux * e}" y2="${y1 + uy * e}" stroke="rgba(60,40,20,.55)" stroke-width="6" stroke-linecap="round"/><line x1="${x1 + ux * s}" y1="${y1 + uy * s}" x2="${x1 + ux * e}" y2="${y1 + uy * e}" stroke="#FFF6E8" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    for (const h of holes) {
      const [x, y] = center(h.id), col = ownerColor(h), mine = h.owner === "me";
      const b = buffer(h);
      terr += `<g class="terr-g ${selected === h.id ? "sel" : ""} ${pulseId === h.id ? "pulse" : ""}" data-hole="${h.id}">
        <polygon points="${hexPts(x, y + 3, HEX)}" fill="rgba(40,25,10,.28)"/>
        <polygon class="hexfill" points="${hexPts(x, y, HEX)}" fill="${col}" stroke="${h.owner ? "#fff" : "#b9a27a"}" stroke-width="2.5" ${h.owner ? "" : 'stroke-dasharray="4 3"'} stroke-linejoin="round"/>
        <polygon points="${hexPts(x, y - 2, HEX - 5)}" fill="rgba(255,255,255,.14)" pointer-events="none"/>
        <text x="${x}" y="${y + 3}" text-anchor="middle" font-size="15" font-weight="900" fill="${h.owner ? "#fff" : "#8a7350"}">${num(h.id)}</text>
        <text x="${x}" y="${y + 14}" text-anchor="middle" font-size="7" font-weight="700" fill="${h.owner ? "rgba(255,255,255,.85)" : "#8a7350"}">PAR ${h.par}</text>
        ${h.owner ? `<g><circle cx="${x + 15}" cy="${y - 15}" r="8.5" fill="#1b0f08" stroke="${b ? "#FFB13B" : "#fff"}" stroke-width="1.6"/><text x="${x + 15}" y="${y - 11.6}" text-anchor="middle" font-size="9" font-weight="800" fill="${b ? "#FFB13B" : "#fff"}">${h.troops}</text></g>` : ""}
        ${mine ? `<path d="M${x - 17} ${y - 4}v-15" stroke="#1b0f08" stroke-width="1.8"/><path d="M${x - 17} ${y - 19}h8l-2.4 3 2.4 3h-8z" fill="#1b0f08"/>` : ""}
        ${h.owner && !h.verified ? `<circle cx="${x - 15}" cy="${y + 13}" r="6.5" fill="#F2577A" stroke="#fff" stroke-width="1.5"/><text x="${x - 15}" y="${y + 16.5}" text-anchor="middle" font-size="9" font-weight="900" fill="#fff">!</text>` : ""}
      </g>`;
    }
    const deco = `
      <g opacity=".9"><circle cx="326" cy="84" r="22" fill="#FFB13B" opacity=".35"/><circle cx="326" cy="84" r="13" fill="#FFB13B" opacity=".8"/></g>
      ${[[286, 120, 1], [320, 150, .8], [34, 300, .9], [328, 520, 1.1], [270, 560, .8], [110, 380, .7]].map(([x, y, s]) => `<g transform="translate(${x},${y}) scale(${s})" fill="#4f8a55"><rect x="-4" y="-22" width="8" height="24" rx="4"/><path d="M-4 -6h-5a3 3 0 0 1-3-3v-6a2.5 2.5 0 0 1 5 0v4h3zM4 -10h5a3 3 0 0 0 3-3v-5a2.5 2.5 0 0 0-5 0v3H4z"/><ellipse cx="0" cy="3" rx="10" ry="2.5" fill="rgba(90,60,30,.18)"/></g>`).join("")}
      <g><ellipse cx="128" cy="300" rx="44" ry="20" fill="#7cc3d6"/><ellipse cx="122" cy="296" rx="30" ry="10" fill="#a5dbe8"/><path d="M98 304q8-4 16 0t16 0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7"/></g>
      ${[[250, 470], [300, 410], [20, 220], [330, 300]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="16" ry="7" fill="#F8EBD0" stroke="#e2c999" stroke-width="1.2"/>`).join("")}
      <path d="M0 250 Q 90 230 180 252 T 366 240" stroke="rgba(180,140,90,.25)" stroke-width="1.2" fill="none"/>
      <path d="M0 405 Q 120 385 220 410 T 366 395" stroke="rgba(180,140,90,.25)" stroke-width="1.2" fill="none"/>`;
    if (board().kind !== "demo") return `<svg class="board" viewBox="0 0 366 608" id="board">${deco.replace(/<g opacity=".9">.*?<\/g>/, "")}${land}${bridges}${links}${terr}${veils}</svg>`;
    return `<svg class="board" viewBox="0 0 366 608" id="board">${deco}${land}${bridges}${links}${terr}${veils}${labels}</svg>`;
  }
  function renderMap() {
    const st = standings();
    view.innerHTML = `<div class="screen">
      <div class="map-top"><div><div class="eyebrow">Week ${S.season.week} · ${(n => n + (n === 1 ? " hole" : " holes"))(Object.values(S.holes).filter(h => h.owner === "me").length)} yours</div><h1 class="h1" style="font-size:26px;margin-top:4px">${board().kind === "demo" ? "The Map" : esc(shortName(board().name))}</h1></div>
        <div class="top-actions"><a class="icon-btn" href="#how">${ic("help")}</a></div></div>
      <div class="legend">${st.map(p => `<span class="chip"><span class="dot" style="background:${p.color}"></span>${p.id === "me" ? "You" : p.name} · ${p.n}</span>`).join("")}<span class="chip"><span class="dot" style="background:#E6D6B4"></span>Open</span></div>
      <div class="board-wrap">${boardSvg()}${board().kind === "demo" ? `<div class="board-note">Demo map · fictional courses</div>` : `<div class="board-chips">${Object.values(S.courses).map(c => `<span style="background:${c.color}">${c.name.toUpperCase()} +${c.bonus}</span>`).join("")}</div><a class="board-note osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>`}</div>
      <div class="map-tip">${ic("swords")}<span>${board().kind === "demo" ? "Tap a hole. Lines = neighbors you can Challenge. Dashes = cart paths between courses." : `Built from the real ${board().name} layout. Holes that sit next to each other are neighbors. Rivals are demo players.`}</span></div>
      <div class="board-switch"><a class="btn ghost small" href="#courses">${ic("map")}${board().kind === "demo" ? "Sync a real course" : "Change course"}</a>${board().kind !== "demo" ? `<a class="btn ghost small" href="#course">Course map</a><a class="btn primary small" href="#play">${ic("flag")}Play GPS</a>` : ""}</div>
    </div>`;
    view.querySelectorAll(".terr-g").forEach(g => g.addEventListener("click", () => openHole(g.dataset.hole)));
    pulseId = null;
  }

  // ---------- HOLE SHEET ----------
  function closeSheet() { sheetRoot.innerHTML = ""; selected = null; $("#board") && view.querySelectorAll(".terr-g.sel").forEach(g => g.classList.remove("sel")); tabbar.classList.remove("hide"); }
  function sheet(html) {
    sheetRoot.innerHTML = `<div class="scrim"></div><div class="sheet"><div class="grabber"></div>${html}</div>`;
    $(".scrim", sheetRoot).onclick = () => { closeSheet(); if (location.hash.split("/").length > 1) history.replaceState(null, "", "#map"); };
    tabbar.classList.add("hide");
  }
  function attackFrom(id) { return neighbors(id).map(n => S.holes[n]).filter(h => h.owner === "me" && !locked(h.id)).sort((a, b) => b.troops - a.troops); }

  function openHole(id) {
    selected = id;
    view.querySelectorAll(".terr-g").forEach(g => g.classList.toggle("sel", g.dataset.hole === id));
    const h = S.holes[id], c = course(id), o = h.owner && P(h.owner), mine = h.owner === "me";
    const b = buffer(h), need = needToTake(h), from = attackFrom(id);
    const canChallenge = h.owner && !mine && from.length > 0;
    let needTxt;
    if (!h.owner) needTxt = `Nobody owns it yet. <b>Any score claims it.</b>`;
    else if (mine) needTxt = `It's yours. Rivals need a <b>${need.strokes <= 0 ? "miracle" : need.strokes + " or better"}</b> to take it${b ? ` (your ${b}-stroke fort included)` : ""}.`;
    else needTxt = `Shoot <b>${need.strokes} or better</b> to take it.${b ? ` That's ${o.name}'s ${relTxt(rel(h))} plus a <b>${b}-stroke fort</b>.` : ` Tie goes to ${o.name}.`}`;
    const lockedHtml = locked(id) ? `<div class="need" style="border-color:rgba(255,177,59,.6)">${c.name} is in the full season. Free covers ${freeName()} only.</div>
      <div style="margin-top:14px"><a href="#unlock" class="btn primary block">${ic("lock")}Unlock full season · $6</a></div>` : "";
    sheet(`<div class="hole-head">${hexSvg(ownerColor(h), num(id), { sub: "PAR " + h.par, cls: "hole-hex" })}
        <div style="flex:1;min-width:0"><div class="eyebrow" style="color:${c.tint}">${c.name}</div><h2 class="h1">Hole ${num(id)}</h2>
        <div class="hole-meta"><span class="chip">Par ${h.par}</span><span class="chip">${h.yards} yds</span>${S.season.stormCourse === c.id ? `<span class="chip orange">${ic("storm")}Haboob week</span>` : ""}</div></div></div>
      <div class="owner-card">${o ? avatar(o) : `<div class="avatar" style="background:#4a3a2c">—</div>`}
        <div class="who"><b>${o ? (mine ? "You hold it" : o.name) : "Up for grabs"}${o && !mine ? demoChip : ""}</b><span>${o ? `${o.hcp} hcp · ${h.verified ? "Partner verified ✓" : `<span style="color:#ff9db3">Unverified score</span>`}` : "First score claims it"}</span></div>
        ${h.owner ? shieldsHtml(b) : ""}</div>
      <div class="stat-grid">
        <div class="stat"><span>Best</span><b>${h.strokes ?? "—"}</b><small>${h.strokes ? scoreName(h.strokes, h.par) + " · " + relTxt(rel(h)) : "No score"}</small></div>
        <div class="stat"><span>Troops</span><b>${h.troops}</b><small>${b ? `+${b} stroke fort` : "No fort yet"}</small></div>
        <div class="stat"><span>Fort cap</span><b>+${MAX_BUFFER}</b><small>3 troops = +1</small></div>
      </div>
      ${locked(id) ? lockedHtml : `<div class="need">${needTxt}</div>
      <div class="label">Neighbors</div>
      <div class="neighbors">${neighbors(id).map(n => { const nh = S.holes[n]; return `<span class="nb"><i style="background:${ownerColor(nh)};${nh.owner ? "" : "color:#8a7350"}">${n}</i>${nh.owner ? (nh.owner === "me" ? "You" : P(nh.owner).name) : "Open"}</span>`; }).join("")}</div>
      <div class="sheet-actions">
        ${mine ? `<a class="btn ghost" href="#army">${ic("shield")}Fortify</a><button class="btn primary" id="btn-post">${ic("flag")}Post score</button>`
               : `<button class="btn ghost" id="btn-chal" ${canChallenge ? "" : "disabled"}>${ic("swords")}Challenge</button><button class="btn primary" id="btn-post">${ic("flag")}Post score</button>`}
      </div>
      <div class="sub">${mine ? "Beat your own best to raise the bar." : canChallenge ? `Challenge from ${from[0].id}: bring troops to cancel their fort.` : h.owner ? "Challenge needs a hole you own next door." : "Open hole. Go claim it."}</div>`}`);
    const pb = $("#btn-post"); if (pb) pb.onclick = () => openPost(id, false);
    const cb = $("#btn-chal"); if (cb) cb.onclick = () => openPost(id, true);
  }

  // ---------- POST SCORE ----------
  function openPost(id, challenge, isMulligan = false) {
    if (locked(id)) { location.hash = "#unlock"; return; }
    const h = S.holes[id], o = h.owner && P(h.owner), me = P("me");
    const from = challenge ? attackFrom(id)[0] : null;
    let strokes = h.par, commit = 0, honor = true, partner = "tank";
    const maxCommit = from ? Math.min(Math.floor((from.troops - 1) / 3), buffer(h)) * 3 : 0;
    function verdict() {
      const r = strokes - h.par, n = needToTake(h, commit / 3);
      if (h.owner === "me") return r < rel(h) ? ["New personal best. Bar raised.", "#2FA36A"] : ["Doesn't beat your best. Still counts for bragging.", "#B9A58E"];
      if (!h.owner) return ["Claims it. Easy money.", "#2FA36A"];
      if (r < n.target) return [`Takes it from ${o.name}.`, "#2FA36A"];
      if (r === n.target) return [`Tie. Goes to ${o.name}, defender's edge.`, "#FFB13B"];
      return [`Not enough. Need ${n.strokes} or better.`, "#F2577A"];
    }
    function draw() {
      const r = strokes - h.par, [vt, vc] = verdict(), sb = sandbagger(r, me.hcp);
      sheet(`<div style="display:flex;align-items:center;justify-content:space-between"><div><div class="eyebrow">${isMulligan ? "Mulligan · " : ""}${challenge ? "Challenge" : "Post score"}</div><h2 class="h1" style="font-size:24px;margin-top:4px">${course(id).name} #${num(id)}</h2></div>
          ${hexSvg(ownerColor(h), num(id), { w: 50, h: 54 })}</div>
        <div class="muted" style="font-size:13.5px;margin-top:6px">Par ${h.par} · ${h.yards} yds · ${o ? `${h.owner === "me" ? "Your" : o.name + "'s"} best: ${h.strokes} (${relTxt(rel(h))})` : "Unclaimed"}</div>
        <div class="stepper"><button class="step-btn" id="minus">−</button>
          <div class="score-big"><b id="sc" style="color:${vc}">${strokes}</b><span style="color:${vc}">${scoreName(strokes, h.par)} · ${relTxt(r)}</span></div>
          <button class="step-btn" id="plus">+</button></div>
        <div class="verdict" style="color:${vc}">${vt}</div>
        ${challenge && from ? `<div class="label">Bring troops from ${from.id} (has ${from.troops})</div>
          <div class="commit">${[0, 3, 6].map(v => `<button data-c="${v}" class="${commit === v ? "on" : ""}" ${v > maxCommit ? "disabled style='opacity:.3'" : ""}>${v === 0 ? "None" : v + " troops · −" + v / 3 + " fort"}</button>`).join("")}</div>
          <div class="sub" style="text-align:left">Win and they march in. Lose and you drop 1 troop.</div>` : ""}
        ${sb ? `<div class="alert">${ic("alert")}<div><b>Sandbagger alert.</b> That's way under your ${me.hcp} hcp. It posts as <b>pending</b> until your partner verifies.</div></div>` : ""}
        <div class="label">Keep it honest</div>
        <div class="opt"><div class="txt">Honor system<small>Played it straight. No foot wedges, no gimmes.</small></div><button class="toggle ${honor ? "on" : ""}" id="honor" aria-label="Honor"></button></div>
        <div class="opt"><div class="txt">Partner verifies<small>They get a tap to confirm. Verified scores get a ✓.</small></div>
          <select class="partner" id="partner">${["none", ...Object.keys(S.players).filter(p => p !== "me")].map(p => `<option value="${p}" ${p === partner ? "selected" : ""}>${p === "none" ? "No partner" : P(p).name}</option>`).join("")}</select></div>
        <div style="margin-top:16px"><button class="btn primary block" id="submit" ${honor ? "" : "disabled"}>${ic("flag")}Post ${strokes} on #${num(id)}</button></div>
        <div class="sub">Prototype: nothing is sent to anyone. Partner verify is simulated.</div>`);
      $("#minus").onclick = () => { if (strokes > 1) { strokes--; draw(); $("#sc").classList.add("bump"); } };
      $("#plus").onclick = () => { if (strokes < h.par + 5) { strokes++; draw(); $("#sc").classList.add("bump"); } };
      $("#honor").onclick = () => { honor = !honor; draw(); };
      $("#partner").onchange = e => { partner = e.target.value; };
      document.querySelectorAll(".commit button").forEach(btn => btn.onclick = () => { if (+btn.dataset.c <= maxCommit) { commit = +btn.dataset.c; draw(); } });
      $("#submit").onclick = () => submit(id, strokes, { challenge, from, commit, partner, sb, isMulligan });
    }
    draw();
  }

  function drawCard() {
    const r = Math.random();
    return r < .1 ? "ace" : r < .2 ? "mull" : ["driver", "iron", "putter"][Math.floor(Math.random() * 3)];
  }

  function submit(id, strokes, o) {
    const h = S.holes[id], prevOwner = h.owner, prevColor = ownerColor(h), prevRel = rel(h), r = strokes - h.par;
    const verified = o.partner !== "none" && !o.sb; // flagged scores stay pending until the partner confirms
    closeSheet();
    if (h.owner === "me") {
      if (r < prevRel) { h.strokes = strokes; h.verified = verified; toast(`New best on #${num(id)}: ${strokes}. Bar raised.`); } else toast("Logged. Your best still stands.");
      save(); route(); return;
    }
    const n = needToTake(h, o.commit / 3);
    const win = !h.owner || r < n.target;
    if (win) {
      h.owner = "me"; h.strokes = strokes; h.verified = verified;
      h.troops = o.challenge && o.commit ? o.commit : 1;
      if (o.challenge && o.commit) o.from.troops -= o.commit;
      let card = null;
      if (!S.capturedThisWeek) { card = drawCard(); if (card === "mull") S.mulligans++; else S.cards.push(card); S.capturedThisWeek = true; }
      S.feed.unshift({ t: "now", icon: "flag", text: `<b>You</b> took <b>${id}</b> ${prevOwner ? `from ${P(prevOwner).name} ` : ""}with ${/^[AEIOU]/.test(scoreName(strokes, h.par)) ? "an" : "a"} ${scoreName(strokes, h.par).toLowerCase()}.` });
      if (o.sb) S.feed.unshift({ t: "now", icon: "alert", text: `<b>Sandbagger alert</b> on your ${id}. Pending partner verify.` });
      save();
      showCapture(id, prevOwner, prevColor, prevRel, strokes, card, o);
    } else {
      if (o.challenge && o.from) o.from.troops = Math.max(1, o.from.troops - 1);
      save();
      showMiss(id, strokes, o);
    }
  }

  function confetti(n = 46) {
    const cols = ["#FF6A2B", "#FFB13B", "#F3E2C2", "#2FA36A", "#F2577A", "#fff"];
    return Array.from({ length: n }, (_, i) => `<i class="confetti" style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-duration:${2.2 + Math.random() * 1.8}s;animation-delay:${1.2 + Math.random() * .8}s;transform:rotate(${Math.random() * 180}deg)"></i>`).join("");
  }
  function showCapture(id, prevOwner, prevColor, prevRel, strokes, card, o) {
    const h = S.holes[id], c = course(id), held = courseCount("me", c.id), tot = Object.keys(S.holes).filter(x => x[0] === c.id).length, full = held === tot;
    const prevName = prevOwner ? P(prevOwner).name : null;
    const line = prevOwner ? `${scoreName(strokes, h.par)} beats ${prevName}'s ${relTxt(prevRel)}. ${prevName} is gonna hear about this.` : `Fresh flag on open ground. Nobody's touching it yet.`;
    overlayRoot.innerHTML = `<div class="capture" style="--cap-glow:rgba(255,106,43,.55)"><div class="cap-rays"></div>${confetti()}
      <div class="cap-hex"><div class="face front">${hexSvg(prevColor, num(id), { w: 190, h: 205, sub: "PAR " + h.par })}</div><div class="face back">${hexSvg(P("me").color, num(id), { w: 190, h: 205, sub: "PAR " + h.par })}</div>
        <svg class="cap-flag" viewBox="0 0 70 110"><path d="M8 108V6" stroke="#FFF6E8" stroke-width="5" stroke-linecap="round"/><path d="M10 8h50l-12 15 12 15H10z" fill="#FFF6E8"/><circle cx="8" cy="6" r="5" fill="#FFB13B"/></svg></div>
      <h1 class="cap-title">HOLE ${num(id)}<br><em>TAKEN.</em></h1>
      <p class="cap-sub">${line}</p>
      <div class="cap-rewards"><span class="chip orange">${c.name} ${held}/${tot}</span>${card ? `<span class="chip green">+1 card: ${CARD_NAMES[card]}</span>` : ""}${o.commit ? `<span class="chip">${o.commit} troops moved in</span>` : ""}${o.sb ? `<span class="chip" style="color:#ff9db3">Pending verify</span>` : ""}${full ? `<span class="chip green">Course bonus +${c.bonus}/wk</span>` : ""}</div>
      <div class="cap-actions"><button class="btn primary block" id="cap-ok">Back to the map</button><button class="btn ghost block" id="cap-share">${ic("share")}Share the W</button></div></div>`;
    $("#cap-ok").onclick = () => { overlayRoot.innerHTML = ""; pulseId = id; const back = o.returnTo || "#map"; if (location.hash !== back) location.hash = back; else route(); };
    $("#cap-share").onclick = () => toast("Share sheet goes here (placeholder, nothing posted).");
  }
  function showMiss(id, strokes, o) {
    const h = S.holes[id], ow = P(h.owner);
    overlayRoot.innerHTML = `<div class="capture miss" style="--cap-glow:${ow.color}55">
      <div class="cap-hex" style="width:150px;height:162px"><div class="face">${hexSvg(ow.color, num(id), { w: 150, h: 162, sub: "PAR " + h.par })}</div></div>
      <h1 class="cap-title" style="animation-delay:.1s">HELD.</h1>
      <p class="cap-sub" style="animation-delay:.25s">${strokes} wasn't enough. ${ow.name}'s ${relTxt(rel(h))}${buffer(h) ? ` plus the fort` : ""} holds. ${o.challenge ? "You lost 1 troop on the charge." : ""}</p>
      <div class="cap-actions" style="animation-delay:.4s;margin-top:24px">${S.mulligans > 0 && !o.isMulligan ? `<button class="btn primary block" id="mull">${ic("redo")}Use a Mulligan (${S.mulligans} left)</button>` : ""}<button class="btn ghost block" id="miss-ok">Back to the map</button></div></div>`;
    const m = $("#mull"); if (m) m.onclick = () => { if (!S.unlocked) { overlayRoot.innerHTML = ""; location.hash = "#unlock"; return; } S.mulligans--; if (S.round[S.active]) delete S.round[S.active][id]; save(); overlayRoot.innerHTML = ""; if (o.returnTo === "#play") { location.hash = "#play"; toast("Mulligan used. Re-post the hole."); } else openPost(id, o.challenge, true); };
    $("#miss-ok").onclick = () => { overlayRoot.innerHTML = ""; if (o.returnTo && location.hash !== o.returnTo) location.hash = o.returnTo; else route(); };
  }

  // ---------- ARMY (troops + cards) ----------
  let selCards = new Set();
  function validSet(types) {
    if (types.length !== 3) return false;
    const real = types.filter(t => t !== "ace"), u = new Set(real);
    return u.size <= 1 || u.size === real.length;
  }
  function renderArmy() {
    const inc = income(), mine = Object.values(S.holes).filter(h => h.owner === "me").sort((a, b) => a.id.localeCompare(b.id));
    const types = [...selCards].map(i => S.cards[i]), ok = validSet(types);
    view.innerHTML = `<div class="screen">
      <div class="map-top"><div><div class="eyebrow">Week ${S.season.week}</div><h1 class="h1" style="font-size:26px;margin-top:4px">Troops & Cards</h1></div><a class="icon-btn" href="#how">${ic("help")}</a></div>
      <section class="troop-hero"><div class="num" id="pool">${S.myTroops}</div><div class="lbl">troops ready<small>Drop them on your holes.<br>3 troops = +1 stroke of defense.</small></div>
        <svg class="soldiers" viewBox="0 0 120 100"><g fill="#1b0f08">${[[20, 40], [55, 30], [90, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10"/><path d="M${x - 14} ${y + 50}q0-34 14-34t14 34z"/>`).join("")}</g></svg></section>
      <div class="income"><div class="income-row total" style="border:0;margin:0;padding:0 0 2px"><span>Next week's troops</span><b>+${inc.total}</b></div>
        <div class="sets" style="margin-top:8px"><span class="chip">${inc.n} holes ÷ 3 · +${inc.base}</span>${Object.values(S.courses).map(c => { const full = continentsOf("me").includes(c.id); return `<span class="chip ${full ? "green" : ""}">${c.abbr || c.name.split(" ")[0]} ${courseCount("me", c.id)}/${Object.keys(S.holes).filter(x => x[0] === c.id).length} · ${full ? "+" + c.bonus : "<span style='opacity:.55'>+" + c.bonus + "</span>"}</span>`; }).join("")}</div></div>
      <div class="section-head"><h2 class="h2">Your hand</h2><span class="muted" style="font-size:12px">${S.cards.length} cards · ${S.mulligans} Mulligan</span></div>
      <div class="hand">${S.cards.map((t, i) => cardHtml(t, i, selCards.has(i))).join("")}${Array.from({ length: S.mulligans }, () => cardHtml("mull", -1, false)).join("")}</div>
      <div class="trade-box"><div class="row2"><p>${selCards.size === 0 ? "Pick 3: three of a kind or one of each. Ace is wild." : ok ? `<b style="color:#A8E8C4">Valid set.</b> Cash it in.` : selCards.size < 3 ? `${3 - selCards.size} more to go.` : `<b style="color:#ff9db3">Not a set.</b> Same, or all different.`}</p>
        <button class="btn primary small" id="trade" ${ok ? "" : "disabled"}>${!S.unlocked ? ic("lock") : ""}Trade +${nextSetValue()}</button></div>
        <div class="sub" style="text-align:left;margin-top:8px">3× same or 1 of each · Ace is wild · sets climb 4, 6, 8, 10…</div></div>
      <div class="section-head"><h2 class="h2">Fortify</h2><span class="muted" style="font-size:12px">Max ${MAX_TROOPS} per hole</span></div>
      <div class="fort-list">${mine.map(h => `<div class="fort"><div class="mini">${hexSvg(P("me").color, num(h.id), { w: 40, h: 44 })}</div>
          <div class="who"><b>${course(h.id).name} #${num(h.id)}</b><span>Best ${h.strokes} (${relTxt(rel(h))}) · ${shieldsHtml(buffer(h))}</span></div>
          <div class="fort-ctl"><button data-m="${h.id}" ${h.troops <= 1 ? "disabled" : ""}>−</button><output>${h.troops}</output><button class="plus" data-p="${h.id}" ${S.myTroops < 1 || h.troops >= MAX_TROOPS ? "disabled" : ""}>+</button></div></div>`).join("")}</div>
      <div style="margin:16px"><button class="btn ghost block" id="nextweek">${ic("sun")}Sim next week (demo)</button><div class="sub">Pays out troops, rolls the Haboob, demo crew makes moves.</div></div>
    </div>`;
    view.querySelectorAll(".gcard[data-card]").forEach(b => b.onclick = () => {
      const i = +b.dataset.card; if (i < 0) { toast("Mulligan: use it after a missed post to re-post that hole."); return; }
      selCards.has(i) ? selCards.delete(i) : selCards.size < 3 && selCards.add(i); renderArmy(); });
    view.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { const h = S.holes[b.dataset.p]; if (S.myTroops > 0 && h.troops < MAX_TROOPS) { h.troops++; S.myTroops--; save(); renderArmy(); if (h.troops % 3 === 0) toast(`#${num(h.id)} fort is now +${buffer(h)} stroke${buffer(h) > 1 ? "s" : ""}.`); } });
    view.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { const h = S.holes[b.dataset.m]; if (h.troops > 1) { h.troops--; S.myTroops++; save(); renderArmy(); } });
    $("#trade").onclick = () => {
      if (!S.unlocked) { location.hash = "#unlock"; return; }
      const v = nextSetValue(); S.cards = S.cards.filter((_, i) => !selCards.has(i)); selCards.clear(); S.tradeCount++; S.myTroops += v; save(); renderArmy(); toast(`Set cashed. +${v} troops.`);
    };
    $("#nextweek").onclick = nextWeek;
  }

  function nextWeek() {
    if (S.season.week >= S.season.weeks) { const w = standings()[0]; toast(`Season over. ${w.id === "me" ? "You win" : w.name + " wins"} with ${w.n} holes.`); return; }
    const inc = income();
    S.season.week++; S.myTroops += inc.total; S.capturedThisWeek = false;
    const stormC = S.season.stormCourse;
    Object.values(S.holes).filter(h => h.id[0] === stormC).forEach(h => { if (h.owner) h.troops = 1; });
    const others = Object.keys(S.courses).filter(c => c !== stormC), nextStorm = others.length ? others[Math.floor(Math.random() * others.length)] : stormC;
    S.season.stormCourse = nextStorm;
    // demo crew makes one move: grab a random neighbor of something they hold
    const bots = Object.keys(S.players).filter(p => p !== "me"), bot = bots[Math.floor(Math.random() * bots.length)];
    const targets = Object.values(S.holes).filter(h => h.owner !== bot && h.owner !== "me" && neighbors(h.id).some(n => S.holes[n].owner === bot));
    if (targets.length) { const t = targets[Math.floor(Math.random() * targets.length)]; t.owner = bot; t.strokes = t.par - 1; t.troops = 1; t.verified = true;
      S.feed.unshift({ t: "now", icon: "flag", text: `<b>${P(bot).name}</b> birdied <b>${t.id}</b> and took it.` }); }
    S.feed.unshift({ t: "now", icon: "storm", text: `Haboob cleared ${S.courses[stormC].name}. Next one's headed for <b>${S.courses[nextStorm].name}</b>.` });
    save(); renderArmy(); toast(`Week ${S.season.week}. +${inc.total} troops. Haboob reset ${S.courses[stormC].name}.`);
  }

  // ---------- RANKS ----------
  let rankTab = "season";
  function renderRanks() {
    const st = standings(), top = [st[1], st[0], st[2]];
    const seasonLocked = !S.unlocked && rankTab === "season";
    const rowsFor = list => list.map((p, i) => `<div class="row ${p.id === "me" ? "me" : ""}"><div class="pos">${i + 1}</div>${avatar(p)}
      <div class="who"><b>${p.name}<span class="badges">${(p.conts || []).map(c => `<span class="cbadge" style="background:${S.courses[c].color}">${S.courses[c].name.split(" ")[0].toUpperCase()}</span>`).join("")}</span></b>
      <span>${p.hcp} hcp · ${Object.values(S.courses).map(c => `${c.abbr || c.name.slice(0, 3).toUpperCase()} ${courseCount(p.id, c.id)}`).join(" · ")}</span></div>
      <div class="terr"><b>${p.n}</b><span>holes</span></div></div>`).join("");
    const fc = freeCourse().id; const courseList = st.map(p => ({ ...p, n: courseCount(p.id, fc), conts: continentsOf(p.id).filter(c => c === fc) })).sort((a, b) => b.n - a.n);
    view.innerHTML = `<div class="screen">
      <div class="map-top"><div><div class="eyebrow">Week ${S.season.week} of ${S.season.weeks}</div><h1 class="h1" style="font-size:26px;margin-top:4px">Leaderboard</h1></div>${demoChip}</div>
      <div class="podium">${top.map((p, i) => `<div class="pod ${["second", "first", "third"][i]}">${avatar(p)}<div class="nm">${p.name}</div><div class="block" style="animation-delay:${[120, 0, 220][i]}ms">${p.n}<small>holes</small></div></div>`).join("")}</div>
      <div class="seg"><button data-t="season" class="${rankTab === "season" ? "on" : ""}">Season${S.unlocked ? "" : " 🔒"}</button><button data-t="course" class="${rankTab === "course" ? "on" : ""}">${freeName()}</button></div>
      ${seasonLocked ? `<div class="locked-rows"><div class="standings rows-blur">${rowsFor(st)}</div><div class="lock-cta"><div><b>Full season board is in the $6 unlock.</b><br><a class="link" href="#unlock">See what's in it →</a></div></div></div>`
        : `<div class="standings">${rowsFor(rankTab === "season" ? st : courseList)}</div>`}
      <div class="section-head"><h2 class="h2">How you win</h2></div>
      <div class="rules"><div class="rule"><div class="rule-ic" style="background:rgba(255,177,59,.15);color:#FFB13B">${ic("trophy", "#FFB13B").replace("<svg", '<svg width="22" height="22"')}</div><div><h3>Most holes after week ${S.season.weeks}</h3><p>Or own all ${Object.keys(S.holes).length} holes for an instant Grand Slam.</p></div></div></div>
    </div>`;
    view.querySelectorAll(".seg button").forEach(b => b.onclick = () => { rankTab = b.dataset.t; renderRanks(); });
  }

  // ---------- HOW TO PLAY ----------
  function renderHow() {
    const rules = [
      ["1", "#FF6A2B", "Holes are territory", "Each hole is a territory. Each course is a continent. Lowest score vs par owns it."],
      ["2", "#2FA36A", "Beat it to take it", "Post a strictly lower score than the holder. Ties go to the defender."],
      ["3", "#FFB13B", "Troops = defense", "Every week you get troops: holes ÷ 3 (min 3), plus a bonus for each full course. Every 3 troops on a hole adds +1 stroke of defense, max +2."],
      ["4", "#7A4DFF", "Cards", "Take at least one hole in a week, draw a card. Trade 3 (same, or one of each, Ace wild) for troops. Sets climb: 4, 6, 8, 10…"],
      ["5", "#E5489A", "Win the season", `Most holes after ${S.season.weeks} weeks wins. Own every course and it's over early.`]
    ];
    const tw = [
      ["swords", "#FF6A2B", "Challenge", "Hit a neighbor of a hole you own. Bring troops to cancel their fort."],
      ["storm", "#E7CFA4", "Haboob", "Weekly dust storm. One course's forts reset to 1."],
      ["redo", "#8a63ff", "Mulligan", "Power-up card. Re-post one hole after a miss."],
      ["alert", "#F2577A", "Sandbagger alert", "Score way under your handicap? It's pending until verified."],
      ["check", "#2FA36A", "Honor + verify", "Honor system by default. Partner taps to verify for a ✓."],
      ["lock", "#FFB13B", "Free vs $6", "Free: GPS on every hole + the front 9 game. $6 unlocks everything."],
      ["map", "#2F6BFF", "Any real course", "Sync a course from OpenStreetMap. GPS finds your hole and gives you yardages."]
    ];
    view.innerHTML = `<div class="screen">
      <div class="map-top"><div><div class="eyebrow">30-second version</div><h1 class="h1" style="font-size:26px;margin-top:4px">How to play</h1></div><a class="icon-btn" href="#home">${ic("close")}</a></div>
      <div class="rules" style="margin-top:10px">${rules.map(([n, c, t, d]) => `<div class="rule"><div class="rule-ic" style="background:${c}22;color:${c}">${n}</div><div><h3>${t}</h3><p>${d}</p></div></div>`).join("")}</div>
      <div class="section-head"><h2 class="h2">The twists</h2></div>
      <div class="twists">${tw.map(([i, c, t, d]) => `<div class="twist"><div class="t-ic" style="background:${c}22">${ic(i, c)}</div><b>${t}</b><p>${d}</p></div>`).join("")}</div>
      <div style="margin:18px 16px 0;display:grid;gap:10px"><a class="btn primary block" href="#map">Got it. Show me the map</a><button class="btn ghost block" id="reset">Reset demo data</button></div>
      <p class="fineprint">Fairway Conquest is a working title. Inspired by classic territory-conquest board games. Demo players and scores are made up. Real course maps: © OpenStreetMap contributors (ODbL).</p>
    </div>`;
    $("#reset").onclick = () => { localStorage.removeItem(KEY); S = fresh(); S.onboarded = true; save(); toast("Demo data reset."); };
  }

  // ---------- UNLOCK (paywall placeholder) ----------
  function renderUnlock() {
    const perks = [
      ["map", "#FF6A2B", "All 18, every course", "Back 9 territory on any synced course, plus the full demo board."],
      ["cards", "#8a63ff", "Cards & power-ups", "Trade-ins, Aces and Mulligans."],
      ["trophy", "#FFB13B", "Season leaderboard", "The full 8-week race, plus the Grand Slam."]
    ];
    overlayRoot.innerHTML = `<div class="unlock"><button class="icon-btn unlock-close" id="ul-close" aria-label="Close">${ic("close")}</button>
      <div class="unlock-art"><svg viewBox="0 0 290 230">
        ${[[90, 120, "#1F7A4D"], [145, 88, "#FF6A2B"], [200, 120, "#33546E"], [145, 152, "#B5532A"], [90, 184, "#F3E2C2"], [200, 184, "#FFB13B"]].map(([x, y, c], i) => `<polygon points="${hexPts(x, y, 34)}" fill="${c}" stroke="rgba(255,255,255,.85)" stroke-width="3" opacity="${i === 1 ? 1 : .92}"/>`).join("")}
        <path d="M145 80V40" stroke="#FFF6E8" stroke-width="4" stroke-linecap="round"/><path d="M147 41h30l-8 10 8 10h-30z" fill="#FFF6E8"/>
        <g transform="translate(118,130)"><rect width="54" height="44" rx="12" fill="#1b0f08" stroke="#FFB13B" stroke-width="2.5"/><path d="M15 16V11a12 12 0 0 1 24 0v5" stroke="#FFB13B" stroke-width="4" fill="none" stroke-linecap="round" transform="translate(0,-14)"/><circle cx="27" cy="22" r="5" fill="#FFB13B"/></g></svg></div>
      <div class="unlock-body"><div class="eyebrow">Full season</div><h1 class="h1">Run the whole desert.</h1>
        <div class="muted" style="font-size:15px">GPS and the front 9 are free. Want the whole thing?</div>
        <div class="price"><b>$6</b><span>one time · no subscription</span></div>
        <div class="perks">${perks.map(([i, c, t, d]) => `<div class="perk"><div class="pk-ic" style="background:${c}22">${ic(i, c)}</div><div>${t}<small>${d}</small></div></div>`).join("")}</div>
        <button class="btn primary block" id="ul-buy">Unlock full season · $6</button>
        <div class="placeholder-tag"><b>Placeholder button.</b> Charges nothing and calls no payment service. The real version would use App Store / Google Play in-app purchase.</div>
        <button class="btn ghost block" id="ul-preview" style="margin-top:12px">${S.unlocked ? "Back to free demo (prototype)" : "Preview unlocked (prototype only)"}</button>
        <div class="free-vs"><div><b>FREE</b>Course sync + GPS yardages<br>Front 9 territory game<br>Demo: Saguaro Flats<br>Course leaderboard</div>
          <div class="paid"><b>$6 UNLOCK</b>All 18 on every course<br>Cards, trade-ins, Mulligans<br>Season leaderboard<br>Grand Slam win</div></div>
        <div class="sub">Restore purchase · Terms · Privacy (placeholders)</div></div></div>`;
    tabbar.classList.add("hide");
    const close = () => { overlayRoot.innerHTML = ""; tabbar.classList.remove("hide"); history.length > 1 ? history.back() : (location.hash = "#home"); };
    $("#ul-close").onclick = close;
    $("#ul-buy").onclick = () => toast("Placeholder. No charge. In-app purchase hooks in here later.");
    $("#ul-preview").onclick = () => { S.unlocked = !S.unlocked; save(); overlayRoot.innerHTML = ""; tabbar.classList.remove("hide"); location.hash = "#map"; toast(S.unlocked ? "Preview mode: everything unlocked. Still $0." : "Back to the free demo."); };
  }

  // =====================================================================
  //  v2: real courses (OpenStreetMap), course map, GPS on-course mode
  // =====================================================================
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const shortName = n => String(n).replace(/\s*(Golf Club|Golf Course|Country Club|Golf Resort)\b/i, "").replace(/\s+·\s+/, " · ");
  const freeCourse = () => Object.values(S.courses).find(c => c.free) || Object.values(S.courses)[0];
  const freeName = () => freeCourse().name;
  const yd = m => m == null ? "—" : Math.round(m / 0.9144);
  const COURSE_KEY = "fc.course.";
  const memCourses = {};
  function saveCourse(c) { memCourses[c.key] = c; try { localStorage.setItem(COURSE_KEY + c.key, JSON.stringify(c)); } catch (e) { toast("Phone storage is full. Course kept for this session only."); } }
  function getCourse(key) {
    if (!key) return null;
    if (memCourses[key]) return memCourses[key];
    try { const c = JSON.parse(localStorage.getItem(COURSE_KEY + key)); if (c) return memCourses[key] = c; } catch (e) {}
    return null;
  }
  function rng(seedStr) { let h = 1779033703 ^ seedStr.length; for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

  const NINES = [
    { id: "F", name: "Front 9", abbr: "F9", color: "#1F7A4D", tint: "#BFE3B4", bonus: 3, free: true },
    { id: "B", name: "Back 9", abbr: "B9", color: "#B5532A", tint: "#F4C79E", bonus: 3, free: false },
    { id: "T", name: "Third 9", abbr: "T9", color: "#33546E", tint: "#B9D3E0", bonus: 3, free: false }
  ];
  const nineOf = ref => ref <= 9 ? NINES[0] : ref <= 18 ? NINES[1] : NINES[2];

  /** Lay real holes onto a hex board that keeps the course's real geography. */
  function hexLayout(points) {
    const W = SQ3 * R, RS = 1.5 * R, OX = 34, OY = 44;
    let pts = points.map(([x, y]) => [x, -y]);
    const bb = a => a.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    let b = bb(pts);
    if (b[2] - b[0] > (b[3] - b[1]) * 1.2) { pts = pts.map(([x, y]) => [-y, x]); b = bb(pts); }   // tall board fits a phone better
    const nn = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map(q => Math.hypot(p[0] - q[0], p[1] - q[1])))).sort((a, c) => a - c);
    const med = nn[Math.floor(nn.length / 2)] || 1;
    let s = (W * 0.72) / med;
    s = Math.min(s, 290 / Math.max(1, b[2] - b[0]), 500 / Math.max(1, b[3] - b[1]));
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const P = pts.map(([x, y]) => [183 + (x - cx) * s, 312 + (y - cy) * s]);
    const cellXY = (r, c) => [OX + c * W + (r & 1) * W / 2, OY + r * RS];
    const taken = new Set(), out = [];
    const order = P.map((p, i) => i);
    for (const i of order) {
      const [x, y] = P[i];
      let best = null;
      for (let r = 0; r <= 12; r++) for (let c = 0; c <= ((r & 1) ? 5 : 6); c++) {
        if (taken.has(r + ":" + c)) continue;
        const [cx2, cy2] = cellXY(r, c), d = Math.hypot(cx2 - x, cy2 - y);
        if (!best || d < best.d) best = { d, r, c };
      }
      taken.add(best.r + ":" + best.c); out[i] = cellXY(best.r, best.c).map(v => +v.toFixed(1));
    }
    return out;
  }

  function buildBoard(course, loopId, manualCount) {
    const loop = course.loops.find(l => l.id === loopId) || course.loops[0];
    const key = course.key + "#" + (loop ? loop.id : "manual");
    const prev = S.boards[key];
    let holesSrc, pts;
    if (loop) {
      const pj = OSM.projector(course.center[0], course.center[1]);
      holesSrc = loop.holes.map(h => ({ ref: h.ref, par: h.par, yards: h.yards }));
      pts = loop.holes.map(h => { const L = h.line.map(pj.fwd); const a = L[0], z = L[L.length - 1]; return [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]; });
    } else {
      holesSrc = Array.from({ length: manualCount }, (_, i) => ({ ref: i + 1, par: 4, yards: null }));
      pts = holesSrc.map((h, i) => { const nine = Math.floor(i / 9), k = i % 9, row = Math.floor(k / 3), col = row % 2 ? 2 - k % 3 : k % 3; return [col * 90 + nine * 140, -(row * 80 + nine * 260)]; });
    }
    const pos = hexLayout(pts);
    const r = rng(key), bots = Object.keys(S.players).filter(p => p !== "me");
    const holes = {}, courses = {};
    holesSrc.forEach((h, i) => {
      const n = nineOf(h.ref), id = n.id + h.ref;
      courses[n.id] = { ...n, name: n.name };
      const old = prev && prev.holes[id];
      if (old) { holes[id] = { ...old, par: h.par, yards: h.yards, pos: pos[i], ref: h.ref }; return; }
      const owned = r() < 0.6, bot = bots[Math.floor(r() * bots.length)];
      const d = [-1, 0, 0, 1, 1, 2][Math.floor(r() * 6)];
      holes[id] = { id, ref: h.ref, par: h.par, yards: h.yards, pos: pos[i], owner: owned ? bot : null, strokes: owned ? h.par + d : null, troops: owned ? 1 + Math.floor(r() * 3) : 0, verified: r() > 0.12 };
    });
    const ids = Object.keys(holes).sort((a, b) => holes[a].ref - holes[b].ref);
    const touching = (a, b) => Math.hypot(holes[a].pos[0] - holes[b].pos[0], holes[a].pos[1] - holes[b].pos[1]) < SQ3 * R * 1.1;
    const bridges = [];
    for (let i = 1; i < ids.length; i++) if (!touching(ids[i - 1], ids[i])) bridges.push([ids[i - 1], ids[i]]);
    const name = course.name + (loop && course.loops.length > 1 ? " · " + loop.name : "");
    S.boards[key] = { key, kind: loop ? "osm" : "manual", name, courseKey: course.key, loopId: loop ? loop.id : null, courses, holes, bridges, storm: courses.B ? "B" : "F", demoRivals: true };
    S.active = key; adjCache = { key: null };
    S.season.stormCourse = S.boards[key].storm;
    save();
    return S.boards[key];
  }

  // ---------- course search ----------
  let searchState = { q: "", label: "", list: null, busy: false, err: null };
  function renderCourses() {
    const saved = Object.values(S.boards).filter(b => b.kind !== "demo");
    view.innerHTML = `<div class="screen">
      <div class="map-top"><div><div class="eyebrow">Sync any course</div><h1 class="h1" style="font-size:26px;margin-top:4px">Courses</h1></div><a class="icon-btn" href="#home">${ic("close")}</a></div>
      <form class="search" id="sform"><input id="q" type="search" placeholder="Course name or town…" value="${esc(searchState.q)}" autocomplete="off" enterkeyhint="search"><button class="btn primary small" type="submit">Search</button></form>
      <div class="pad" style="margin-top:10px"><button class="btn ghost block" id="near">${ic("eye")}Find courses near me</button></div>
      <div id="sres">${resultsHtml()}</div>
      ${saved.length ? `<div class="section-head"><h2 class="h2">Synced</h2><span class="muted" style="font-size:12px">Saved on this phone</span></div>
        <div class="results">${saved.map(b => `<button class="result" data-board="${esc(b.key)}"><div class="r-ic" style="background:#1F7A4D">${Object.keys(b.holes).length}</div><div class="who"><b>${esc(b.name)}</b><span>${b.kind === "manual" ? "Set up by hand · no map" : "OpenStreetMap layout"}${b.key === S.active ? " · playing now" : ""}</span></div>${ic("map", "#B9A58E")}</button>`).join("")}</div>` : ""}
      <div class="section-head"><h2 class="h2">Demo</h2></div>
      <div class="results"><button class="result" data-board="demo"><div class="r-ic" style="background:#B5532A">27</div><div class="who"><b>Demo board</b><span>3 fictional courses · no GPS</span></div>${ic("map", "#B9A58E")}</button></div>
      <p class="fineprint">Course maps come from OpenStreetMap, edited by volunteers. Coverage varies: some courses have every hole mapped, some have none. Searches go to Nominatim and Overpass (free public servers) and get cached on your phone.<br><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:#FFB13B">Map data © OpenStreetMap contributors (ODbL)</a></p>
    </div>`;
    $("#sform").onsubmit = e => { e.preventDefault(); const q = $("#q").value.trim(); if (q.length < 3) { toast("Type at least 3 letters."); return; } doSearch(() => OSM.search(q), q); };
    $("#near").onclick = () => {
      if (!navigator.geolocation || !window.isSecureContext) { toast("Near me needs GPS over https. Try a search instead."); return; }
      searchState = { ...searchState, busy: true, err: null, label: "Finding you…" }; paintResults();
      navigator.geolocation.getCurrentPosition(p => doSearch(() => OSM.coursesNear(p.coords.latitude, p.coords.longitude, 25000).then(list => ({ label: "Courses within 25 km of you", list })), ""),
        e => { searchState = { ...searchState, busy: false, err: e.code === 1 ? "Location blocked. Allow it, or search by name." : "Couldn't get your location." }; paintResults(); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    };
    bindResults(view);
  }
  function resultsHtml() {
    const st = searchState;
    if (st.busy) return `<div class="loading"><div class="spinner"></div><span id="ostatus" style="flex:1">${esc(st.label || "Searching…")}</span><button class="btn ghost small" id="cancelsearch">Cancel</button></div>`;
    if (st.err) return `<div class="need" style="margin:14px 16px 0">${esc(st.err)}</div>`;
    if (!st.list) return "";
    if (!st.list.length) return `<div class="need" style="margin:14px 16px 0">${esc(st.label)}. Try the course's full name or a nearby town.</div>`;
    const mapped = st.list.filter(c => c.holes >= 9).length;
    return `<div class="section-head"><h2 class="h2" style="font-size:13px">${esc(st.label)}</h2><span class="muted" style="font-size:12px">${mapped}/${st.list.length} mapped</span></div>
      <div class="results">${st.list.slice(0, 40).map(c => `<button class="result" data-osm="${c.osmType}/${c.osmId}" data-name="${esc(c.name)}" data-area="${esc(c.area || "")}" data-lat="${c.lat}" data-lon="${c.lon}">
        <div class="r-ic" style="background:${c.holes >= 9 ? "#1F7A4D" : c.holes > 0 ? "#B5532A" : "#4a3a2c"}">${c.holes == null ? "?" : c.holes >= 9 ? c.holes : c.holes || "–"}</div>
        <div class="who"><b>${esc(c.name)}</b><span>${c.km != null ? c.km.toFixed(1) + " km · " : ""}${c.holes == null ? "Hole data unknown" : c.holes >= 9 ? `${c.holes} holes mapped` : c.holes > 0 ? `Only ${c.holes} hole${c.holes > 1 ? "s" : ""} mapped` : "No hole data"}${c.area ? " · " + esc(c.area) : ""}</span></div>
        ${c.holes >= 9 ? `<span class="chip green">Sync</span>` : `<span class="chip">Open</span>`}</button>`).join("")}</div>`;
  }
  function paintResults() { const el = $("#sres"); if (el) { el.innerHTML = resultsHtml(); bindResults(el); const cs = $("#cancelsearch"); if (cs) cs.onclick = () => { OSM.cancel(); searchState = { ...searchState, busy: false, err: "Search cancelled." }; paintResults(); }; } }
  async function doSearch(fn, q) {
    searchState = { q, busy: true, err: null, list: null, label: "Searching OpenStreetMap…" }; paintResults();
    OSM.onStatus(t => { const el = $("#ostatus"); if (el) el.textContent = t; });
    try { const r = await fn(); searchState = { q, busy: false, err: null, list: r.list, label: r.label }; }
    catch (e) { if (e.message === "cancelled") return; searchState = { q, busy: false, err: "OpenStreetMap servers didn't answer (they're free and sometimes busy). Give it a minute and try again." }; }
    paintResults();
  }
  function bindResults(root) {
    root.querySelectorAll("[data-board]").forEach(b => b.onclick = () => { S.active = b.dataset.board; adjCache = { key: null }; save(); GPS.D.holeId = null; toast(`Playing ${board().name}.`); location.hash = board().kind === "demo" ? "#map" : "#course"; });
    root.querySelectorAll("[data-osm]").forEach(b => b.onclick = () => { const [t, id] = b.dataset.osm.split("/"); syncCourse(t, +id, { name: b.dataset.name, area: b.dataset.area, center: [+b.dataset.lat, +b.dataset.lon] }); });
  }
  async function syncCourse(type, id, meta) {
    overlayRoot.innerHTML = `<div class="busy"><div class="spinner big"></div><b>${esc(meta.name)}</b><span id="ostatus2">Pulling holes, greens and bunkers from OpenStreetMap…</span><button class="btn ghost small" id="cancelsync" style="margin-top:10px">Cancel</button></div>`;
    $("#cancelsync").onclick = () => OSM.cancel();
    OSM.onStatus(t => { const el = $("#ostatus2"); if (el) el.textContent = t; });
    let c;
    try { c = await OSM.loadCourse(type, id, meta); }
    catch (e) { overlayRoot.innerHTML = ""; toast(e.message === "cancelled" ? "Sync cancelled." : "Couldn't reach OpenStreetMap (free servers are busy). Try again in a minute."); return; }
    overlayRoot.innerHTML = "";
    saveCourse(c);
    if (!c.loops.length) return noHolesSheet(c);
    if (c.loops.length > 1) return pickLoopSheet(c);
    finishSync(c, c.loops[0].id);
  }
  function finishSync(c, loopId) {
    const b = buildBoard(c, loopId); GPS.D.holeId = null; GPS.D.auto = true;
    const loop = c.loops.find(l => l.id === loopId);
    const guessed = loop.holes.filter(h => h.parSource === "guess").length;
    toast(`${loop.holes.length} holes synced${c.source === "snapshot" ? " (saved snapshot)" : ""}.${guessed ? ` ${guessed} pars guessed. Check them.` : ""}`);
    location.hash = "#course";
  }
  function pickLoopSheet(c) {
    sheet(`<div class="eyebrow">${esc(c.name)}</div><h2 class="h1" style="font-size:24px;margin:6px 0 4px">Which course?</h2>
      <div class="muted" style="font-size:14px">This club has ${c.loops.reduce((a, l) => a + l.holes.length, 0)} holes mapped. Pick the one you're playing.</div>
      <div class="results" style="margin:14px 0 0">${c.loops.map(l => `<button class="result" data-loop="${l.id}"><div class="r-ic" style="background:#1F7A4D">${l.holes.length}</div><div class="who"><b>${esc(l.name)}</b><span>${l.parsKnown ? `Par ${l.holes.reduce((a, h) => a + h.par, 0)}${l.parsKnown < l.holes.length ? " (some guessed)" : ""}` : "Pars not mapped. You can set them."} · ${l.holes.reduce((a, h) => a + h.yards, 0).toLocaleString()} yds</span></div></button>`).join("")}</div>`);
    sheetRoot.querySelectorAll("[data-loop]").forEach(b => b.onclick = () => { closeSheet(); finishSync(c, b.dataset.loop); });
  }
  function noHolesSheet(c) {
    sheet(`<div class="eyebrow">${esc(c.name)}</div><h2 class="h1" style="font-size:24px;margin:6px 0 8px">No holes mapped yet</h2>
      <div class="muted" style="font-size:14.5px;line-height:1.45">OpenStreetMap has this course's outline${c.features.bunkers.length ? ` and ${c.features.bunkers.length} bunkers` : ""}, but not its holes. So no GPS yardages here yet.</div>
      <div style="display:grid;gap:10px;margin-top:16px">
        <button class="btn primary block" id="man18">Set up 18 holes by hand</button>
        <button class="btn ghost block" id="man9">Set up 9 holes by hand</button>
        <button class="btn ghost block" id="demo">Play the demo board instead</button></div>
      <div class="sub">By hand = territory game + score entry, you set the pars. Anyone can add the holes on <a href="https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dgolf_course" target="_blank" rel="noopener" style="color:#FFB13B">OpenStreetMap</a>.</div>`);
    const man = n => { closeSheet(); buildBoard(c, null, n); toast(`${n} holes set up. Set your pars.`); location.hash = "#course"; setTimeout(() => parSheet(), 300); };
    $("#man18").onclick = () => man(18); $("#man9").onclick = () => man(9);
    $("#demo").onclick = () => { closeSheet(); S.active = "demo"; adjCache = { key: null }; save(); location.hash = "#map"; };
  }
  function parSheet() {
    const b = board(), c = getCourse(b.courseKey), loop = c && c.loops.find(l => l.id === b.loopId);
    const ids = Object.keys(b.holes).sort((x, y) => b.holes[x].ref - b.holes[y].ref);
    const srcOf = h => { const lh = loop && loop.holes.find(x => x.ref === h.ref); return lh ? lh.parSource : "you"; };
    sheet(`<div class="eyebrow">${esc(b.name)}</div><h2 class="h1" style="font-size:24px;margin:6px 0 4px">Pars</h2>
      <div class="muted" style="font-size:13.5px">From OpenStreetMap where mapped. "Guess" = from hole length. Fix anything that's off.</div>
      <div class="par-list">${ids.map(id => { const h = b.holes[id], src = srcOf(h); return `<div class="par-row"><b>#${h.ref}</b><span>${h.yards ? h.yards + " yds" : "—"}</span><span class="src ${src}">${src === "osm" ? "OSM" : src === "guess" ? "Guess" : "You"}</span>
        <div class="fort-ctl"><button data-pm="${id}">−</button><output>${h.par}</output><button class="plus" data-pp="${id}">+</button></div></div>`; }).join("")}</div>
      <div class="sub">Total par ${ids.reduce((a, id) => a + b.holes[id].par, 0)}</div>
      <button class="btn primary block" id="pdone" style="margin-top:12px">Done</button>`);
    const setPar = (id, d) => { const h = b.holes[id], np = Math.max(3, Math.min(6, h.par + d)), dd = np - h.par; h.par = np; if (dd && h.owner && P(h.owner).demo && h.strokes != null) h.strokes += dd; if (loop) { const lh = loop.holes.find(x => x.ref === h.ref); if (lh) { lh.par = h.par; lh.parSource = "manual"; } saveCourse(c); } save(); const y = sheetRoot.querySelector(".sheet").scrollTop; parSheet(); sheetRoot.querySelector(".sheet").scrollTop = y; };
    sheetRoot.querySelectorAll("[data-pm]").forEach(x => x.onclick = () => setPar(x.dataset.pm, -1));
    sheetRoot.querySelectorAll("[data-pp]").forEach(x => x.onclick = () => setPar(x.dataset.pp, 1));
    $("#pdone").onclick = () => { closeSheet(); route(); };
  }

  // ---------- geometry for the active course ----------
  function geo() {
    const b = board(); if (b.kind !== "osm") return null;
    const c = getCourse(b.courseKey); if (!c) return null;
    const loop = c.loops.find(l => l.id === b.loopId) || c.loops[0]; if (!loop) return null;
    if (geo._k === b.key + c.fetchedAt + (geo._v || 0) && geo._g) return geo._g;
    const pj = OSM.projector(c.center[0], c.center[1]);
    const F = {}; for (const k of Object.keys(c.features)) F[k] = c.features[k].map(r => r.map(pj.fwd));
    const holes = loop.holes.map(h => {
      const pts = h.line.map(pj.fwd), id = nineOf(h.ref).id + h.ref;
      const green = h.green >= 0 ? F.greens[h.green] : null;
      return { id, ref: h.ref, pts, tee: pts[0], end: pts[pts.length - 1], green, gC: green ? OSM.centroid(green) : pts[pts.length - 1] };
    });
    const outline = (c.outline || []).map(r => r.map(pj.fwd));
    geo._k = b.key + c.fetchedAt + (geo._v || 0); geo._g = { c, loop, pj, F, holes, outline };
    return geo._g;
  }
  const geoHole = (g, id) => g && g.holes.find(h => h.id === id);

  // ---------- GPS wiring ----------
  let playHole = null, playStrokes = null, tapPt = null, lastFix = null, playView = "hole";
  GPS.on(G => {
    const g = geo();
    if (g && G.fix) {
      const P = g.pj.fwd([G.fix.lat, G.fix.lon]); lastFix = { P, acc: G.fix.acc, sim: G.fix.sim };
      const r = GPS.detect(g.holes, P);
      if (r.changed && r.holeId && r.holeId !== playHole) {
        const prevHole = playHole; playHole = r.holeId; playStrokes = null; tapPt = null;
        if (prevHole && location.hash.startsWith("#play")) toast(`On #${num(playHole)} now · auto`);
      }
      lastFix.offCourse = !!r.offCourse;
    } else if (!G.fix) lastFix = null;
    if (location.hash.startsWith("#play")) paintPlay();
  });

  function simPath(g, fromId) {
    const i = Math.max(0, g.holes.findIndex(h => h.id === fromId));
    const seq = g.holes.slice(i).concat(g.holes.slice(0, i));
    return seq.flatMap(h => { const pts = h.pts.slice(); if (h.gC) pts.push(h.gC); return pts.map(p => g.pj.inv(p)); });
  }

  // ---------- svg drawing helpers (local meters) ----------
  const polyStr = (pts, T) => pts.map(p => T(p).map(v => v.toFixed(1)).join(",")).join(" ");
  function featuresSvg(g, T, box, k, opts = {}) {
    const near = r => r.some(p => { const q = T(p); return q[0] > box[0] - 80 && q[0] < box[2] + 80 && q[1] > box[1] - 80 && q[1] < box[3] + 80; });
    const od = S.outdoor;
    const poly = (arr, fill, stroke, sw) => arr.filter(near).map(r => `<polygon points="${polyStr(r, T)}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw * k}"` : ""} stroke-linejoin="round"/>`).join("");
    return poly(g.outline, od ? "#CFE3B5" : "#B9D79A", null, 0)
      + poly(g.F.fairways, od ? "#4E9E45" : "#6DB85F", od ? "#2f6d2a" : null, 1)
      + poly(g.F.water, od ? "#2C8FD0" : "#59B4DE", od ? "#0f5a8c" : "#3d97c4", 1)
      + poly(g.F.tees, od ? "#3f8c39" : "#7CC56E", "#fff", .8)
      + poly(g.F.greens, od ? "#3FBF4F" : "#9BE07F", od ? "#0b4d18" : "#fff", od ? 2 : 1.4)
      + poly(g.F.bunkers, od ? "#FFF2D2" : "#F6E7C4", od ? "#8a6a2a" : "#d8bd85", od ? 1.6 : 1);
  }

  /** Current hole drawn tee-at-bottom, green-at-top (rotated), sized to the viewport. */
  function holeSvg(g, gh, Wpx, Hpx) {
    const a = gh.tee, z = gh.gC, ang = Math.atan2(z[1] - a[1], z[0] - a[0]), phi = Math.PI / 2 - ang, cs = Math.cos(phi), sn = Math.sin(phi);
    const T = p => [p[0] * cs - p[1] * sn, -(p[0] * sn + p[1] * cs)];
    const Ti = q => { const x = q[0], y = -q[1]; return [x * cs + y * sn, -x * sn + y * cs]; };
    const key = [...gh.pts, ...(gh.green || []), gh.gC].map(T);
    let b = key.reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    b = [b[0] - 35, b[1] - 48, b[2] + 35, b[3] + 22];
    let w = b[2] - b[0], h = b[3] - b[1];
    const ar = Wpx / Hpx;
    if (w / h < ar) { const nw = h * ar; b[0] -= (nw - w) / 2; b[2] += (nw - w) / 2; w = nw; } else { const nh = w / ar; b[1] -= (nh - h) / 2; b[3] += (nh - h) / 2; h = nh; }
    const k = h / Hpx;  // meters per css px
    let s = `<rect x="${b[0]}" y="${b[1]}" width="${w}" height="${h}" fill="${S.outdoor ? "#F4EBD8" : "#D8BC8C"}"/>`;
    s += `<polyline points="${polyStr(gh.pts, T)}" fill="none" stroke="${S.outdoor ? "#9DCB86" : "#8EC370"}" stroke-width="${46}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
    s += featuresSvg(g, T, b, k);
    // distance arcs from the tee: 100/150/200/250 yds to the green
    const gc = T(gh.gC);
    [100, 150, 200, 250].forEach(yds => { const m = yds * 0.9144; if (m > OSM.lineLen(gh.pts) + 20) return;
      s += `<path d="M${gc[0] - m * .2} ${gc[1] + m * .98} A ${m} ${m} 0 0 0 ${gc[0] + m * .2} ${gc[1] + m * .98}" fill="none" stroke="${S.outdoor ? "#111" : "#fff"}" stroke-opacity=".55" stroke-width="${1.2 * k}" stroke-dasharray="${4 * k} ${3 * k}"/>
        <text x="${gc[0] + m * .2 + 4 * k}" y="${gc[1] + m * .98 + 4 * k}" font-size="${10 * k}" font-family="Unbounded" font-weight="800" fill="${S.outdoor ? "#111" : "#fff"}" opacity=".85">${yds}</text>`; });
    s += `<polyline points="${polyStr(gh.pts, T)}" fill="none" stroke="${S.outdoor ? "#111" : "#fff"}" stroke-width="${2 * k}" stroke-dasharray="${5 * k} ${4 * k}" stroke-linecap="round" opacity=".9"/>`;
    s += `<g transform="translate(${gc[0]},${gc[1]})"><path d="M0 0V${-26 * k}" stroke="#1b0f08" stroke-width="${2 * k}"/><path d="M0 ${-26 * k}h${14 * k}l${-4 * k} ${5 * k} ${4 * k} ${5 * k}H0z" fill="#FF6A2B"/><circle r="${2.6 * k}" fill="#1b0f08"/></g>`;
    const tt = T(gh.tee); s += `<circle cx="${tt[0]}" cy="${tt[1]}" r="${5 * k}" fill="#fff" stroke="#1b0f08" stroke-width="${1.5 * k}"/>`;
    let P = lastFix && !lastFix.offCourse ? T(lastFix.P) : null;
    if (P && (P[0] < b[0] - 60 || P[0] > b[2] + 60 || P[1] < b[1] - 60 || P[1] > b[3] + 60)) P = null;
    const from = P || tt;
    if (tapPt) {
      const tp = T(tapPt), d1 = Math.hypot(tp[0] - from[0], tp[1] - from[1]), d2 = Math.hypot(tp[0] - gc[0], tp[1] - gc[1]);
      const lbl = (x, y, t) => `<g transform="translate(${x},${y})"><rect x="${-20 * k}" y="${-11 * k}" width="${40 * k}" height="${22 * k}" rx="${11 * k}" fill="#1b0f08"/><text y="${4.5 * k}" text-anchor="middle" font-size="${12 * k}" font-family="Unbounded" font-weight="900" fill="#FFB13B">${t}</text></g>`;
      s += `<line x1="${from[0]}" y1="${from[1]}" x2="${tp[0]}" y2="${tp[1]}" stroke="#FFB13B" stroke-width="${2.5 * k}"/><line x1="${tp[0]}" y1="${tp[1]}" x2="${gc[0]}" y2="${gc[1]}" stroke="#FFB13B" stroke-width="${2.5 * k}" stroke-dasharray="${4 * k} ${3 * k}"/>
        <circle cx="${tp[0]}" cy="${tp[1]}" r="${8 * k}" fill="none" stroke="#FFB13B" stroke-width="${3 * k}"/><circle cx="${tp[0]}" cy="${tp[1]}" r="${2.5 * k}" fill="#FFB13B"/>
        ${lbl((from[0] + tp[0]) / 2 + 26 * k, (from[1] + tp[1]) / 2, yd(d1))}${lbl((tp[0] + gc[0]) / 2 + 26 * k, (tp[1] + gc[1]) / 2, yd(d2))}`;
    }
    if (P) s += `<circle cx="${P[0]}" cy="${P[1]}" r="${Math.max(lastFix.acc, 3)}" fill="#2F6BFF" fill-opacity=".16" stroke="#2F6BFF" stroke-opacity=".4" stroke-width="${k}"/><circle class="me-dot" cx="${P[0]}" cy="${P[1]}" r="${8 * k}" fill="#2F6BFF" stroke="#fff" stroke-width="${3 * k}"/>`;
    return { svg: `<svg class="holemap" viewBox="${b[0]} ${b[1]} ${w} ${h}" preserveAspectRatio="xMidYMid meet">${s}</svg>`, Ti };
  }

  function courseSvg(g, Wpx, Hpx) {
    const T = p => [p[0], -p[1]];
    const all = [...g.outline.flat(), ...g.holes.flatMap(h => h.pts)].map(T);
    let b = all.reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    b = [b[0] - 30, b[1] - 30, b[2] + 30, b[3] + 30];
    let w = b[2] - b[0], h = b[3] - b[1]; const ar = Wpx / Hpx;
    if (w / h < ar) { const nw = h * ar; b[0] -= (nw - w) / 2; w = nw; } else { const nh = w / ar; b[1] -= (nh - h) / 2; h = nh; }
    const k = Math.max(w / Wpx, h / Hpx);
    let s = `<rect x="${b[0]}" y="${b[1]}" width="${w}" height="${h}" fill="${S.outdoor ? "#F4EBD8" : "#D8BC8C"}"/>`;
    s += featuresSvg(g, T, b, k);
    g.holes.forEach(gh => {
      const own = S.holes[gh.id], col = own && own.owner ? P(own.owner).color : "#8a7350";
      s += `<polyline points="${polyStr(gh.pts, T)}" fill="none" stroke="${S.outdoor ? "#111" : "#fff"}" stroke-width="${2.2 * k}" stroke-linecap="round" opacity=".95"/>`;
      const t = T(gh.tee);
      s += `<g class="cm-hole" data-h="${gh.id}"><circle cx="${t[0]}" cy="${t[1]}" r="${12 * k}" fill="${col}" stroke="#fff" stroke-width="${2 * k}"/><text x="${t[0]}" y="${t[1] + 4 * k}" text-anchor="middle" font-size="${11 * k}" font-family="Unbounded" font-weight="900" fill="#fff">${gh.ref}</text></g>`;
    });
    if (lastFix && !lastFix.offCourse) { const p = T(lastFix.P); s += `<circle class="me-dot" cx="${p[0]}" cy="${p[1]}" r="${7 * k}" fill="#2F6BFF" stroke="#fff" stroke-width="${2.5 * k}"/>`; }
    return `<svg class="coursemap" viewBox="${b[0]} ${b[1]} ${w} ${h}">${s}</svg>`;
  }

  // ---------- course map screen ----------
  function renderCourse() {
    const b = board();
    if (b.kind === "demo") { location.hash = "#courses"; return; }
    const g = geo(), c = getCourse(b.courseKey);
    const ids = Object.keys(S.holes).sort((x, y) => S.holes[x].ref - S.holes[y].ref), par = ids.reduce((a, id) => a + S.holes[id].par, 0);
    const guessed = g ? g.loop.holes.filter(h => h.parSource === "guess").length : 0;
    view.innerHTML = `<div class="screen">
      <div class="map-top"><div style="min-width:0"><div class="eyebrow">${b.kind === "manual" ? "Set up by hand" : c && c.source === "snapshot" ? "OSM snapshot" : "Synced from OpenStreetMap"}</div><h1 class="h1" style="font-size:24px;margin-top:4px">${esc(shortName(b.name))}</h1></div><a class="icon-btn" href="#courses">${ic("close")}</a></div>
      <div class="legend"><span class="chip">${ids.length} holes</span><span class="chip">Par ${par}</span>${g ? `<span class="chip">${g.loop.holes.reduce((a, h) => a + h.yards, 0).toLocaleString()} yds</span><span class="chip">${g.F.greens.length} greens · ${g.F.bunkers.length} bunkers</span>` : ""}</div>
      ${g ? `<div class="course-wrap" id="cwrap">${courseSvg(g, 366, 430)}<a class="board-note osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div>
        <div class="map-tip">${ic("flag")}<span>Tap a hole number to play it. Colors = who owns it in the game.</span></div>`
        : `<div class="need" style="margin:12px 16px 0">No hole map for this course, so no GPS yardages. Score entry and the territory game still work. Pick your hole by hand.</div>`}
      ${guessed ? `<div class="need" style="margin:12px 16px 0">${guessed} par${guessed > 1 ? "s aren't" : " isn't"} in OpenStreetMap, so they're guessed from length. <a class="link" href="#" id="fixpar">Check pars</a></div>` : ""}
      <div class="cta-row"><a class="btn primary" style="flex:1.2" href="#play">${ic("flag")}Play with GPS</a><a class="btn ghost" style="flex:1" href="#map">Territory</a></div>
      <div class="pad" style="margin-top:10px"><button class="btn ghost block" id="pars">Edit pars</button></div>
    </div>`;
    view.querySelectorAll(".cm-hole").forEach(el => el.addEventListener("click", () => { GPS.setHole(el.dataset.h); playHole = el.dataset.h; playStrokes = null; tapPt = null; location.hash = "#play"; }));
    $("#pars").onclick = parSheet; const fp = $("#fixpar"); if (fp) fp.onclick = e => { e.preventDefault(); parSheet(); };
  }

  // ---------- PLAY (on-course GPS) ----------
  function renderPlay() {
    const b = board();
    if (b.kind === "demo") {
      view.innerHTML = `<div class="screen"><div class="map-top"><div><div class="eyebrow">On-course mode</div><h1 class="h1" style="font-size:26px;margin-top:4px">Play</h1></div></div>
        <div class="empty"><div class="empty-ic">${ic("flag", "#FF6A2B")}</div><h2 class="h2">Sync a real course first</h2><p>The demo board is fictional, so there's nothing to GPS. Grab your course from OpenStreetMap.</p><a class="btn primary block" href="#courses">${ic("map")}Find a course</a></div></div>`;
      return;
    }
    const ids = Object.keys(S.holes).sort((x, y) => S.holes[x].ref - S.holes[y].ref);
    if (!playHole || !S.holes[playHole]) playHole = GPS.D.holeId && S.holes[GPS.D.holeId] ? GPS.D.holeId : ids[0];
    view.innerHTML = `<div class="screen play" id="play"></div>`;
    paintPlay(true);
  }
  function paintPlay(full) {
    const root = $("#play"); if (!root) return;
    const g = geo(), b = board(), G = GPS.G;
    const ids = Object.keys(S.holes).sort((x, y) => S.holes[x].ref - S.holes[y].ref);
    if (!playHole || !S.holes[playHole]) playHole = ids[0];
    const h = S.holes[playHole], gh = geoHole(g, playHole);
    const rnd = (S.round[S.active] = S.round[S.active] || {});
    if (playStrokes == null) playStrokes = rnd[playHole] ?? h.par;
    // yardages
    let yds = null, fromTee = true;
    if (gh) {
      const usable = lastFix && !lastFix.offCourse && OSM.polyDist(lastFix.P, gh.pts) < 300;
      const Pm = usable ? lastFix.P : gh.tee; fromTee = !usable;
      yds = OSM.greenYardages(Pm, gh.green, gh.gC);
      if (tapPt) yds.tap = OSM.dist2(Pm, tapPt);
    }
    const posted = rnd[playHole] != null;
    const r = playStrokes - h.par, need = needToTake(h), o = h.owner && P(h.owner);
    const lk = locked(playHole);
    let line;
    if (!h.owner) line = `<b>Open hole.</b> Any score claims it.`;
    else if (h.owner === "me") line = `<b>You hold it</b> with ${h.strokes}.`;
    else line = `<b>${esc(o.name)}</b> holds it with ${h.strokes}${buffer(h) ? ` +${buffer(h)} fort` : ""}. Need <b>${need.strokes}</b>.`;
    const verdictCol = h.owner === "me" ? "var(--muted)" : !h.owner || r < need.target ? "#2FA36A" : r === need.target ? "#FFB13B" : "#F2577A";
    const thru = Object.keys(rnd).filter(k => S.holes[k]), tot = thru.reduce((a, k) => a + rnd[k] - S.holes[k].par, 0);
    const gpsChip = G.mode === "off" ? `<button class="gps-chip off" id="gpson">${ic("eye")}GPS off</button>`
      : G.error && !G.fix ? `<button class="gps-chip warn" id="gpson">${ic("alert")}${esc(G.error)}</button>`
      : !G.fix ? `<span class="gps-chip">${ic("eye")}Finding you…</span>`
      : `<button class="gps-chip ${G.fix.acc <= 10 ? "good" : G.fix.acc <= 25 ? "ok" : "warn"}" id="gpsinfo"><i></i>${G.fix.sim ? "SIM · " : ""}±${Math.round(G.fix.acc)} m</button>`;
    root.innerHTML = `
      <div class="play-top"><div style="min-width:0"><div class="eyebrow">${esc(shortName(b.name))}</div>
        <div class="hole-title"><b>Hole ${h.ref}</b><span>Par ${h.par}${h.yards ? `<br>${h.yards} yds` : ""}</span></div></div>
        <div class="top-actions">${g ? gpsChip : ""}<button class="icon-btn ${S.outdoor ? "on" : ""}" id="outdoor" aria-label="Outdoor mode">${ic("sun")}</button></div></div>
      <div class="hole-strip" id="strip">${g ? `<button class="hs auto ${GPS.D.auto ? "on" : ""}" id="auto">AUTO</button>` : ""}${ids.map(id => `<button class="hs ${id === playHole ? "cur" : ""} ${rnd[id] != null ? "done" : ""}" data-hs="${id}" style="--oc:${S.holes[id].owner ? P(S.holes[id].owner).color : "transparent"}">${S.holes[id].ref}</button>`).join("")}</div>
      ${gh ? `<div class="yards">
        <div class="yd side"><span>Front</span><b>${yds.front == null ? "—" : yd(yds.front)}</b></div>
        <div class="yd main"><span>${fromTee ? "Center · from tee" : "Center"}</span><b>${yd(yds.center)}</b></div>
        <div class="yd side"><span>Back</span><b>${yds.back == null ? "—" : yd(yds.back)}</b></div></div>`
        : `<div class="yards none"><b>No map for this hole</b><span>Yardages need the hole mapped in OpenStreetMap. Scoring still works.</span></div>`}
      <div class="hole-wrap" id="hwrap">${gh ? "" : `<div class="nomap">${hexSvg(ownerColor(h), h.ref, { sub: "PAR " + h.par, w: 120, h: 130 })}</div>`}
        ${gh ? `<div class="map-hint">${tapPt ? `<b>${yd(yds.tap)}</b> to tap · tap again to move` : "Tap the map to measure"}</div><div class="map-tools"><button class="icon-btn" id="tocourse" aria-label="Course map">${ic("map")}</button>${tapPt ? `<button class="icon-btn" id="clrtap" aria-label="Clear">${ic("close")}</button>` : ""}</div>` : ""}
        ${gh ? `<div class="osm-attr">© OpenStreetMap</div>` : `<div class="map-hint">Pick your hole above. No map, so no auto-detect.</div>`}</div>
      <div class="score-card">
        <div class="score-line"><span>${line}</span><span class="thru">${thru.length ? `Thru ${thru.length} · ${tot === 0 ? "E" : tot > 0 ? "+" + tot : tot}` : "Round not started"}</span></div>
        <div class="score-row">
          <button class="sbtn" id="sminus" ${posted ? "disabled" : ""}>−</button>
          <div class="sval"><b style="color:${posted ? "var(--cream)" : verdictCol}">${playStrokes}</b><span>${scoreName(playStrokes, h.par)}</span></div>
          <button class="sbtn" id="splus" ${posted ? "disabled" : ""}>+</button>
          <button class="spost ${posted ? "done" : ""}" id="spost">${posted ? `${ic("check")}Posted` : lk ? `${ic("lock")}Unlock` : `${ic("flag")}Post`}</button>
        </div>
        <div class="score-opts"><button class="mini-opt" id="partner">${ic("users")}Verify: ${S.partner === "none" ? "none" : esc(P(S.partner).name)}</button>${g ? `<button class="mini-opt" id="sim">${ic("redo")}${G.mode === "sim" ? "Stop sim" : "Simulate GPS"}</button>` : `<a class="mini-opt" href="#course">${ic("map")}Edit pars</a>`}</div>
      </div>`;
    // map
    if (gh) {
      const wrap = $("#hwrap"), Wp = wrap.clientWidth || 358, Hp = wrap.clientHeight || 260;
      const hm = holeSvg(g, gh, Wp, Hp);
      wrap.insertAdjacentHTML("afterbegin", hm.svg);
      const svg = wrap.querySelector("svg");
      svg.addEventListener("click", e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); tapPt = hm.Ti([q.x, q.y]); paintPlay(); });
      const ct = $("#clrtap"); if (ct) ct.onclick = () => { tapPt = null; paintPlay(); };
      $("#tocourse").onclick = () => { location.hash = "#course"; };
    }
    const strip = $("#strip"), cur = strip.querySelector(".cur"); if (cur && full !== false) strip.scrollLeft = Math.max(0, cur.offsetLeft - 120);
    strip.querySelectorAll("[data-hs]").forEach(x => x.onclick = () => { GPS.setHole(x.dataset.hs); playHole = x.dataset.hs; playStrokes = null; tapPt = null; paintPlay(); });
    if ($("#auto")) $("#auto").onclick = () => { GPS.setAuto(!GPS.D.auto); if (GPS.D.auto) toast("Auto hole detection on."); paintPlay(); };
    $("#outdoor").onclick = () => { S.outdoor = !S.outdoor; save(); applyOutdoor(); paintPlay(); toast(S.outdoor ? "Outdoor mode: max contrast for the sun." : "Outdoor mode off."); };
    const gon = $("#gpson"); if (gon) gon.onclick = () => { if (G.mode === "sim") return; GPS.setAuto(true); GPS.startLive(); };
    const gi = $("#gpsinfo"); if (gi) gi.onclick = () => toast(G.fix.sim ? "Simulated GPS. Walking the real hole line." : `GPS accuracy ±${Math.round(G.fix.acc)} m. Under 10 m is great.`);
    $("#sminus").onclick = () => { if (playStrokes > 1) { playStrokes--; paintPlay(); } };
    $("#splus").onclick = () => { if (playStrokes < h.par + 6) { playStrokes++; paintPlay(); } };
    $("#partner").onclick = () => { const opts = ["none", ...Object.keys(S.players).filter(p => p !== "me")]; S.partner = opts[(opts.indexOf(S.partner) + 1) % opts.length]; save(); paintPlay(); };
    if ($("#sim")) $("#sim").onclick = () => {
      if (G.mode === "sim") { GPS.stop(); toast("Simulation stopped."); return; }
      if (!g) { toast("Simulation needs a mapped course."); return; }
      GPS.setAuto(true); GPS.D.holeId = playHole; GPS.startSim(simPath(g, playHole), { metersPerTick: 20, ms: 1000 }); toast("Simulating: walking the real hole line.");
    };
    $("#spost").onclick = () => {
      if (posted) { toast(`Already posted ${rnd[playHole]} on #${h.ref}. A Mulligan lets you re-post after a miss.`); return; }
      if (lk) { location.hash = "#unlock"; return; }
      const sb = sandbagger(playStrokes - h.par, P("me").hcp);
      rnd[playHole] = playStrokes; save();
      submit(playHole, playStrokes, { challenge: false, from: null, commit: 0, partner: S.partner, sb, isMulligan: false, returnTo: "#play" });
    };
  }

  function applyOutdoor() { $("#app").classList.toggle("outdoor", !!S.outdoor); }
  applyOutdoor();

  // debugging / screenshot hooks
  window.FCdev = {
    syncFromSnapshot: async (type, id, loopIdx = 0) => { const r = await fetch(`data/${type}-${id}.json`); const c = OSM.parseCourse(await r.json(), { key: `${type}/${id}`, source: "snapshot" }); saveCourse(c); return buildBoard(c, c.loops[loopIdx].id).key; },
    simAtHole: (ref, frac = 0.5) => { const g = geo(); const gh = g.holes.find(h => h.ref === ref); const L = OSM.lineLen(gh.pts); let d = L * frac, p = gh.pts[0];
      for (let i = 1; i < gh.pts.length; i++) { const s = OSM.dist2(gh.pts[i - 1], gh.pts[i]); if (d <= s) { const t = d / s; p = [gh.pts[i - 1][0] + (gh.pts[i][0] - gh.pts[i - 1][0]) * t, gh.pts[i - 1][1] + (gh.pts[i][1] - gh.pts[i - 1][1]) * t]; break; } d -= s; p = gh.pts[i]; }
      GPS.D.auto = true; GPS.D.holeId = null; const ll = g.pj.inv(p); GPS.simAt(ll[0], ll[1], 4); },
    tapAt: (fx, fy) => { const svg = document.querySelector(".holemap"); const r = svg.getBoundingClientRect(); svg.dispatchEvent(new MouseEvent("click", { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true })); },
    geo
  };


  // ---------- router ----------
  function route() {
    const [r, arg] = (location.hash.slice(1) || "home").split("/");
    if (r !== "unlock") overlayRoot.innerHTML = "";
    sheetRoot.innerHTML = ""; tabbar.classList.remove("hide");
    document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === (r === "how" ? "home" : r === "post" ? "map" : r === "course" || r === "courses" ? "play" : r)));
    view.scrollTop = 0;
    if (r === "map" || r === "post") { renderMap(); if (arg && S.holes[arg]) r === "post" ? openPost(arg, false) : openHole(arg); }
    else if (r === "play") renderPlay();
    else if (r === "course") renderCourse();
    else if (r === "courses") renderCourses();
    else if (r === "army") renderArmy();
    else if (r === "ranks") renderRanks();
    else if (r === "how") renderHow();
    else if (r === "unlock") { if (!view.innerHTML) renderHome(); renderUnlock(); }
    else renderHome();
  }
  window.addEventListener("hashchange", route);
  route();
  window.FC = { state: () => S, reset: () => { localStorage.removeItem(KEY); location.reload(); } };
  if (!GPS.G.fix && board().kind === "osm" && S.gpsAuto !== false && window.isSecureContext && navigator.permissions) navigator.permissions.query({ name: "geolocation" }).then(p => { if (p.state === "granted") GPS.startLive(); }).catch(() => {});
})();
