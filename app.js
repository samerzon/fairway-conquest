/* Fairway Conquest v3 — head-to-head golf territory match.
   Static HTML/CSS/JS, no backend. State lives in localStorage on each phone; two-phone matches sync peer to peer (net.js).
   Format: a MATCH between 2 players (up to 4) on one real course. Win a hole to claim it; win by 2+ to also steal a touching rival hole.
   Stakes are TRACKING ONLY: no money moves in this app. */
(() => {
  const KEY = "fairwayConquest.match.v3";
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app"), view = $("#view"), sheetRoot = $("#sheet-root"), overlayRoot = $("#overlay-root"), tabbar = $("#tabbar");
  const SQ3 = Math.sqrt(3), R = 30, HEX = 26;
  const COLORS = ["#2EE58A", "#FFB547", "#5AB4FF", "#FF6FA8"];         // you = fairway green, rival = desert sun, later seats
  const INK = ["#05140b", "#1d1102", "#04121f", "#22050f"];
  const QUICK = [
    { type: "way", id: 61499695, name: "Camelback Golf Club", area: "Scottsdale, AZ" },
    { type: "way", id: 78388948, name: "TPC Scottsdale Stadium Course", area: "Scottsdale, AZ" }
  ];

  // ---------- state ----------
  const blankDraft = () => ({ boardKey: null, range: "all", players: [{ name: "You" }, { name: "" }], mode: "local", stake: { type: "none", hole: 5, match: 20 } });
  function fresh() { return { v: 3, onboarded: false, outdoor: false, boards: {}, draft: blankDraft(), match: null, history: [] }; }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || S.v !== 3) S = fresh();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  save();

  // ---------- small helpers ----------
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const shortName = n => String(n).replace(/\s*(Golf Club|Golf Course|Country Club|Golf Resort)\b/i, "").replace(/\s+·\s+/, " · ");
  const rel = n => n === 0 ? "E" : n > 0 ? "+" + n : "−" + -n;
  const yd = m => m == null ? "—" : Math.round(m / 0.9144);
  const money = n => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n * 100) / 100);
  const scoreName = (strokes, par) => {
    const d = strokes - par; if (strokes === 1) return "Ace";
    return ({ "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Double" })[d] || (d < -3 ? "Unreal" : "Triple+");
  };
  let toastT;
  function toast(msg) { const t = $("#toast"); t.innerHTML = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
  function hexPts(cx, cy, r) {
    const p = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); p.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1)); }
    return p.join(" ");
  }
  const ICONS = {
    flag: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    swords: '<path d="M4 4l9 9M4 4v4M4 4h4M20 4l-9 9M20 4v4M20 4h-4M7 17l-3 3M17 17l3 3M9 15l-2 2M15 15l2 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    map: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
    redo: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 4v4.5h4.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    cart: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    dollar: '<path d="M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.3 1.3-4.3 3.2 0 4.6 9 2.3 9 6.8 0 2-1.9 3.3-4.7 3.3-2.2 0-3.9-.8-4.8-2.3"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a4.8 4.8 0 0 1 6.4 0"/><circle cx="12" cy="19.3" r=".8"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'
  };
  const ic = (n, color = "currentColor", extra = "") => `<svg viewBox="0 0 24 24" style="stroke:${color};fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" ${extra}>${ICONS[n]}</svg>`;
  /** Palm silhouette (Arizona touch). */
  const palm = (x, y, s = 1, op = 1) => `<g transform="translate(${x},${y}) scale(${s})" opacity="${op}"><path d="M0 0c2-40 6-80 14-118l5 1c-7 38-11 78-12 117z"/>
    <path d="M16 -118c-18-8-40-6-58 8 18-4 36-4 52 0zM16 -118c-10-16-30-26-52-24 18 4 34 12 46 26zM18 -118c4-18 18-32 38-36-14 10-24 22-30 38zM18 -118c18-6 40-2 56 12-18-2-36-4-52-6zM18 -116c14 6 26 20 30 38-10-14-20-24-34-32zM14 -116c-12 8-20 22-22 38 6-14 14-26 26-34z"/></g>`;

  // ---------- courses & boards ----------
  const COURSE_KEY = "fc.course.";
  const memCourses = {};
  function saveCourse(c) { memCourses[c.key] = c; try { localStorage.setItem(COURSE_KEY + c.key, JSON.stringify(c)); } catch (e) { toast("Phone storage is full. Course kept for this session only."); } }
  function getCourse(key) {
    if (!key) return null;
    if (memCourses[key]) return memCourses[key];
    try { const c = JSON.parse(localStorage.getItem(COURSE_KEY + key)); if (c) return memCourses[key] = c; } catch (e) {}
    return null;
  }

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


  /** A board = one playable loop of a course: holes with par, yards and a hex position that keeps the real geography. */
  function buildBoard(course, loopId, manualCount) {
    const loop = course.loops.find(l => l.id === loopId) || course.loops[0];
    const key = course.key + "#" + (loop ? loop.id : "manual" + manualCount);
    let holesSrc, pts;
    if (loop) {
      const pj = OSM.projector(course.center[0], course.center[1]);
      holesSrc = loop.holes.map(h => ({ ref: h.ref, par: h.par, yards: h.yards }));
      pts = loop.holes.map(h => { const L = h.line.map(pj.fwd); const a = L[0], z = L[L.length - 1]; return [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]; });
    } else {
      holesSrc = Array.from({ length: manualCount }, (_, i) => ({ ref: i + 1, par: 4, yards: null }));
      pts = holesSrc.map((h, i) => { const nine = Math.floor(i / 9), k = i % 9, row = Math.floor(k / 3), col = row % 2 ? 2 - k % 3 : k % 3; return [col * 90 + nine * 140, -(row * 80 + nine * 260)]; });
    }
    const pos = hexLayout(pts), holes = {};
    holesSrc.forEach((h, i) => { const id = "H" + h.ref; holes[id] = { id, ref: h.ref, par: h.par, yards: h.yards, pos: pos[i] }; });
    const name = course.name + (loop && course.loops.length > 1 ? " · " + loop.name : "");
    S.boards[key] = { key, kind: loop ? "osm" : "manual", name, area: course.area || "", courseKey: course.key, loopId: loop ? loop.id : null, holes };
    save();
    return S.boards[key];
  }
  const holeIds = b => Object.keys(b.holes).sort((x, y) => b.holes[x].ref - b.holes[y].ref);
  const parOf = b => holeIds(b).reduce((a, id) => a + b.holes[id].par, 0);
  function adjacency(b) {
    const ids = Object.keys(b.holes), A = {}; ids.forEach(a => A[a] = []);
    for (const a of ids) for (const c of ids) if (a < c) {
      const [x1, y1] = b.holes[a].pos, [x2, y2] = b.holes[c].pos;
      if (Math.hypot(x1 - x2, y1 - y2) < SQ3 * R * 1.1) { A[a].push(c); A[c].push(a); }
    }
    return A;
  }

  // ---------- match engine ----------
  const M = () => S.match;
  const mBoard = (m = M()) => m && S.boards[m.boardKey];
  const mHoles = (m = M()) => m ? m.holes : [];
  /** Replays the match from the score log. Pure: ownership, events, ledger and standings are always derived, so editing a hole just works. */
  function resolve(m = M()) {
    const b = mBoard(m), adj = adjacency(b), owner = {}, how = {}, events = [], ledger = [];
    const ids = m.players.map(p => p.id);
    for (const hid of m.log) {
      const sc = m.scores[hid]; if (!sc) continue;
      const vals = ids.map(p => sc[p]).filter(v => v != null); if (vals.length < ids.length) continue;
      const best = Math.min(...vals), winners = ids.filter(p => sc[p] === best);
      const ev = { hole: hid, best, scores: sc };
      if (winners.length > 1) { ev.tie = true; events.push(ev); continue; }
      const w = winners[0], second = Math.min(...ids.filter(p => p !== w).map(p => sc[p]));
      ev.winner = w; ev.margin = second - best;
      if (owner[hid] && owner[hid] !== w) ev.retook = owner[hid];
      owner[hid] = w; how[hid] = "won";
      if (ev.margin >= 2) {
        const target = (adj[hid] || []).filter(n => owner[n] && owner[n] !== w).sort((x, y) => b.holes[x].ref - b.holes[y].ref)[0];
        if (target) { ev.steal = target; ev.stoleFrom = owner[target]; owner[target] = w; how[target] = "stolen"; }
      }
      if (m.stake.type === "hole" || m.stake.type === "both") ids.filter(p => p !== w).forEach(p => ledger.push({ hole: hid, from: p, to: w, amt: m.stake.hole }));
      events.push(ev);
    }
    const strokes = {}, played = m.log.filter(h => m.scores[h] && ids.every(p => m.scores[h][p] != null));
    ids.forEach(p => strokes[p] = played.reduce((a, h) => a + m.scores[h][p], 0));
    const par = played.reduce((a, h) => a + b.holes[h].par, 0);
    const count = {}; ids.forEach(p => count[p] = 0); Object.values(owner).forEach(p => count[p]++);
    const steals = {}; ids.forEach(p => steals[p] = events.filter(e => e.steal && e.winner === p).length);
    const table = m.players.map(p => ({ ...p, holes: count[p.id], strokes: strokes[p.id], toPar: strokes[p.id] - par, steals: steals[p.id] }))
      .sort((x, y) => y.holes - x.holes || x.strokes - y.strokes);
    const leader = table.length > 1 && (table[0].holes > table[1].holes || (table[0].holes === table[1].holes && table[0].strokes < table[1].strokes)) ? table[0] : null;
    const complete = played.length === m.holes.length;
    if (complete && leader && (m.stake.type === "match" || m.stake.type === "both")) ids.filter(p => p !== leader.id).forEach(p => ledger.push({ hole: "match", from: p, to: leader.id, amt: m.stake.match }));
    const net = {}; ids.forEach(p => net[p] = 0); ledger.forEach(l => { net[l.from] -= l.amt; net[l.to] += l.amt; });
    return { owner, how, events, ledger, net, table, leader, played, complete, par, adj };
  }
  /** Fewest payments to square up (works for 2-4 players). */
  function settle(net) {
    const cred = Object.entries(net).filter(([, v]) => v > 0).map(([p, v]) => [p, v]), debt = Object.entries(net).filter(([, v]) => v < 0).map(([p, v]) => [p, -v]);
    const out = [];
    for (const d of debt) for (const c of cred) { if (d[1] <= 0) break; const x = Math.min(d[1], c[1]); if (x > 0) { out.push({ from: d[0], to: c[0], amt: x }); d[1] -= x; c[1] -= x; } }
    return out;
  }
  const pl = id => M().players.find(p => p.id === id);
  const nextOpen = m => m.holes.find(h => !(m.scores[h] && m.players.every(p => m.scores[h][p.id] != null)));
  function newMatch(d) {
    const b = S.boards[d.boardKey];
    let holes = holeIds(b);
    if (d.range === "front") holes = holes.filter(h => b.holes[h].ref <= 9); else if (d.range === "back") holes = holes.filter(h => b.holes[h].ref > 9);
    const code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    S.match = { id: Date.now().toString(36), code, created: Date.now(), boardKey: b.key, holes, mode: d.mode,
      players: d.players.map((p, i) => ({ id: "p" + (i + 1), name: (p.name || "").trim() || (i ? "Player " + (i + 1) : "You"), color: COLORS[i], ink: INK[i] })),
      stake: { ...d.stake }, scores: {}, st: {}, fs: {}, seats: { p1: S.dev }, log: [], cur: holes[0], done: false };
    if (d.mode === "invite") S.match.net = { role: "host", hostId: `fcq-${S.match.id}-${code.toLowerCase()}`, myPid: "p1" };
    playEdit = null; save();
  }

  // ---------- territory board (hex) ----------
  let hbN = 0;
  /** Risk-style board: each hole a hex in real-course geography. Owned hexes glow in the owner's color over a desert-course backdrop (set in CSS). */
  function hexBoard(m, o = {}) {
    const b = mBoard(m), r = resolve(m), ids = m.holes, fid = "hg" + (++hbN);
    const P = ids.map(id => b.holes[id].pos);
    let bb = P.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const pad = HEX + 10; bb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    const route = ids.map(id => b.holes[id].pos.join(",")).join(" ");
    let s = `<defs><filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    s += `<polyline points="${route}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    ids.forEach(id => {
      const h = b.holes[id], [x, y] = h.pos, own = r.owner[id], p = own && pl(own), cur = !o.noCur && id === m.cur && !m.done;
      s += `<g class="hx ${cur ? "cur" : ""} ${p ? "own" : "open"}" data-hx="${id}">
        ${cur ? `<polygon class="hx-ring" points="${hexPts(x, y, HEX + 4)}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>` : ""}
        ${p ? `<polygon points="${hexPts(x, y, HEX - 1)}" fill="${p.color}" fill-opacity=".34" stroke="${p.color}" stroke-width="2.6" stroke-linejoin="round" filter="url(#${fid})"/>`
            : `<polygon points="${hexPts(x, y, HEX - 1)}" fill="rgba(4,8,6,.55)" stroke="rgba(255,255,255,.38)" stroke-width="1.4" stroke-dasharray="3 3" stroke-linejoin="round"/>`}
        <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="800" font-style="italic" fill="${p ? "#fff" : "rgba(255,255,255,.75)"}" stroke="rgba(0,0,0,.55)" stroke-width="3" paint-order="stroke">${h.ref}</text>
        ${r.how[id] === "stolen" ? `<circle cx="${x + 14}" cy="${y - 14}" r="6.5" fill="#050706" stroke="${p.color}" stroke-width="1.6"/><path d="M${x + 11.5} ${y - 14}h5M${x + 14.5} ${y - 16.5}l2.2 2.5-2.2 2.5" stroke="${p.color}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` : ""}</g>`;
    });
    return `<svg class="hexboard" viewBox="${bb[0]} ${bb[1]} ${bb[2] - bb[0]} ${bb[3] - bb[1]}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  }
  const dot = p => `<i class="pdot" style="background:${p.color};--pc:${p.color}"></i>`;
  /** Glass scoreboard: holes owned is the big number. */
  function scoreboard(m, r = resolve(m), big = false) {
    return `<div class="sb ${big ? "big" : ""}">${m.players.map(p => { const t = r.table.find(x => x.id === p.id);
      return `<div class="sb-p ${r.leader && r.leader.id === p.id ? "lead" : ""}" style="--pc:${p.color}"><div class="sb-name">${dot(p)}<span>${esc(p.name)}</span></div><div class="sb-n"><b>${t.holes}</b><small>${t.holes === 1 ? "hole" : "holes"}${r.played.length ? ` · ${rel(t.toPar)}` : ""}</small></div></div>`; }).join("")}</div>`;
  }
  const tally = (m, r = resolve(m)) => `<span class="tally">${m.players.map(p => `<b style="color:${p.color}">${r.table.find(x => x.id === p.id).holes}</b>`).join("<i>–</i>")}</span>`;

  // ---------- geometry for the match course (GPS yardages) ----------
  function geo() {
    const b = mBoard(); if (!b || b.kind !== "osm") return null;
    const c = getCourse(b.courseKey); if (!c) return null;
    const loop = c.loops.find(l => l.id === b.loopId) || c.loops[0]; if (!loop) return null;
    if (geo._k === b.key + c.fetchedAt + (S.outdoor ? 1 : 0) && geo._g) return geo._g;
    const pj = OSM.projector(c.center[0], c.center[1]);
    const F = {}; for (const k of Object.keys(c.features)) F[k] = c.features[k].map(r => r.map(pj.fwd));
    const holes = loop.holes.map(h => {
      const pts = h.line.map(pj.fwd), green = h.green >= 0 ? F.greens[h.green] : null;
      return { id: "H" + h.ref, ref: h.ref, pts, tee: pts[0], end: pts[pts.length - 1], green, gC: green ? OSM.centroid(green) : pts[pts.length - 1] };
    });
    const outline = (c.outline || []).map(r => r.map(pj.fwd));
    geo._k = b.key + c.fetchedAt + (S.outdoor ? 1 : 0); geo._g = { c, loop, pj, F, holes, outline };
    return geo._g;
  }
  const geoHole = (g, id) => g && g.holes.find(h => h.id === id);
  let tapPt = null, lastFix = null;
  GPS.on(G => {
    const g = geo(), m = M();
    if (g && G.fix) {
      const Pp = g.pj.fwd([G.fix.lat, G.fix.lon]); lastFix = { P: Pp, acc: G.fix.acc, sim: G.fix.sim };
      const r = GPS.detect(g.holes.filter(h => !m || m.holes.includes(h.id)), Pp);
      if (r.changed && r.holeId && m && !m.done && r.holeId !== m.cur) { m.cur = r.holeId; playEdit = null; tapPt = null; save(); if (onPlayish()) toast(`On #${m.cur.slice(1)} now · auto`); }
      lastFix.offCourse = !!r.offCourse;
    } else if (!G.fix) lastFix = null;
    if (onPlayish()) repaint();
  });
  const onPlayish = () => /^#(play|cart)/.test(location.hash);
  function yardsFor(hid) {
    const g = geo(), gh = geoHole(g, hid); if (!gh) return null;
    const usable = lastFix && !lastFix.offCourse && OSM.polyDist(lastFix.P, gh.pts) < 300;
    const y = OSM.greenYardages(usable ? lastFix.P : gh.tee, gh.green, gh.gC);
    if (y && tapPt) y.tap = OSM.dist2(usable ? lastFix.P : gh.tee, tapPt);
    return y && { ...y, fromTee: !usable };
  }
  function simPath(g, fromId) {
    const i = Math.max(0, g.holes.findIndex(h => h.id === fromId));
    const seq = g.holes.slice(i).concat(g.holes.slice(0, i));
    return seq.flatMap(h => { const pts = h.pts.slice(); if (h.gC) pts.push(h.gC); return pts.map(p => g.pj.inv(p)); });
  }
  function gpsChip() {
    const G = GPS.G;
    return G.mode === "off" ? `<button class="gps-chip off" data-gps>${ic("pin")}GPS</button>`
      : G.error && !G.fix ? `<button class="gps-chip warn" data-gps>${esc(G.error)}</button>`
      : !G.fix ? `<span class="gps-chip">${ic("pin")}Finding you…</span>`
      : `<button class="gps-chip ${G.fix.acc <= 10 ? "good" : G.fix.acc <= 25 ? "ok" : "warn"}" data-gpsinfo><i></i>${G.fix.sim ? "SIM · " : ""}±${Math.round(G.fix.acc)} m</button>`;
  }
  function bindGps(root) {
    root.querySelectorAll("[data-gps]").forEach(x => x.onclick = () => { if (GPS.G.mode === "sim") return; GPS.setAuto(true); GPS.startLive(); });
    root.querySelectorAll("[data-gpsinfo]").forEach(x => x.onclick = () => toast(GPS.G.fix.sim ? "Simulated GPS: walking the real hole line." : `GPS accuracy ±${Math.round(GPS.G.fix.acc)} m. Under 10 m is great.`));
  }

  // ---------- svg drawing helpers (local meters) ----------
  const polyStr = (pts, T) => pts.map(p => T(p).map(v => v.toFixed(1)).join(",")).join(" ");
  function featuresSvg(g, T, box, k, opts = {}) {
    const near = r => r.some(p => { const q = T(p); return q[0] > box[0] - 80 && q[0] < box[2] + 80 && q[1] > box[1] - 80 && q[1] < box[3] + 80; });
    const od = S.outdoor;
    const poly = (arr, fill, stroke, sw) => arr.filter(near).map(r => `<polygon points="${polyStr(r, T)}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw * k}"` : ""} stroke-linejoin="round"/>`).join("");
    return poly(g.outline, od ? "#CFE3B5" : "#16241a", null, 0)
      + poly(g.F.fairways, od ? "#4E9E45" : "#1f5a35", od ? "#2f6d2a" : null, 1)
      + poly(g.F.water, od ? "#2C8FD0" : "#1f6f9c", od ? "#0f5a8c" : "#2b86b8", 1)
      + poly(g.F.tees, od ? "#3f8c39" : "#2b7a45", "#fff", .8)
      + poly(g.F.greens, od ? "#3FBF4F" : "#3fcf7c", od ? "#0b4d18" : "#fff", od ? 2 : 1.4)
      + poly(g.F.bunkers, od ? "#FFF2D2" : "#d8c9a2", od ? "#8a6a2a" : "#b9a57a", od ? 1.6 : 1);
  }

  /** Current hole drawn tee-at-bottom, green-at-top (rotated), sized to the viewport. */
  function holeSvg(g, gh, Wpx, Hpx, o = {}) {
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
    let s = `<rect x="${b[0]}" y="${b[1]}" width="${w}" height="${h}" fill="${S.outdoor ? "#F4EBD8" : (o.bg || "#0f1511")}"/>`;
    s += `<polyline points="${polyStr(gh.pts, T)}" fill="none" stroke="${S.outdoor ? "#9DCB86" : "#1d4a2c"}" stroke-width="${46}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
    s += featuresSvg(g, T, b, k);
    // distance arcs from the tee: 100/150/200/250 yds to the green
    const gc = T(gh.gC);
    [100, 150, 200, 250].forEach(yds => { const m = yds * 0.9144; if (m > OSM.lineLen(gh.pts) + 20) return;
      s += `<path d="M${gc[0] - m * .2} ${gc[1] + m * .98} A ${m} ${m} 0 0 0 ${gc[0] + m * .2} ${gc[1] + m * .98}" fill="none" stroke="${S.outdoor ? "#111" : "#fff"}" stroke-opacity=".55" stroke-width="${1.2 * k}" stroke-dasharray="${4 * k} ${3 * k}"/>
        <text x="${gc[0] + m * .2 + 4 * k}" y="${gc[1] + m * .98 + 4 * k}" font-size="${10 * k}" font-family="Barlow Cond, sans-serif" font-style="italic" font-weight="800" fill="${S.outdoor ? "#111" : "#fff"}" opacity=".85">${yds}</text>`; });
    s += `<polyline points="${polyStr(gh.pts, T)}" fill="none" stroke="${S.outdoor ? "#111" : "#fff"}" stroke-width="${2 * k}" stroke-dasharray="${5 * k} ${4 * k}" stroke-linecap="round" opacity=".9"/>`;
    s += `<g transform="translate(${gc[0]},${gc[1]})"><path d="M0 0V${-26 * k}" stroke="#1b0f08" stroke-width="${2 * k}"/><path d="M0 ${-26 * k}h${14 * k}l${-4 * k} ${5 * k} ${4 * k} ${5 * k}H0z" fill="#FFB547"/><circle r="${2.6 * k}" fill="#1b0f08"/></g>`;
    const tt = T(gh.tee); s += `<circle cx="${tt[0]}" cy="${tt[1]}" r="${5 * k}" fill="#fff" stroke="#1b0f08" stroke-width="${1.5 * k}"/>`;
    let P = lastFix && !lastFix.offCourse ? T(lastFix.P) : null;
    if (P && (P[0] < b[0] - 60 || P[0] > b[2] + 60 || P[1] < b[1] - 60 || P[1] > b[3] + 60)) P = null;
    const from = P || tt;
    if (tapPt) {
      const tp = T(tapPt), d1 = Math.hypot(tp[0] - from[0], tp[1] - from[1]), d2 = Math.hypot(tp[0] - gc[0], tp[1] - gc[1]);
      const lbl = (x, y, t) => `<g transform="translate(${x},${y})"><rect x="${-20 * k}" y="${-11 * k}" width="${40 * k}" height="${22 * k}" rx="${11 * k}" fill="#1b0f08"/><text y="${4.5 * k}" text-anchor="middle" font-size="${12 * k}" font-family="Barlow Cond, sans-serif" font-style="italic" font-weight="900" fill="#FFB547">${t}</text></g>`;
      s += `<line x1="${from[0]}" y1="${from[1]}" x2="${tp[0]}" y2="${tp[1]}" stroke="#FFB547" stroke-width="${2.5 * k}"/><line x1="${tp[0]}" y1="${tp[1]}" x2="${gc[0]}" y2="${gc[1]}" stroke="#FFB547" stroke-width="${2.5 * k}" stroke-dasharray="${4 * k} ${3 * k}"/>
        <circle cx="${tp[0]}" cy="${tp[1]}" r="${8 * k}" fill="none" stroke="#FFB547" stroke-width="${3 * k}"/><circle cx="${tp[0]}" cy="${tp[1]}" r="${2.5 * k}" fill="#FFB547"/>
        ${lbl((from[0] + tp[0]) / 2 + 26 * k, (from[1] + tp[1]) / 2, yd(d1))}${lbl((tp[0] + gc[0]) / 2 + 26 * k, (tp[1] + gc[1]) / 2, yd(d2))}`;
    }
    if (P) s += `<circle cx="${P[0]}" cy="${P[1]}" r="${Math.max(lastFix.acc, 3)}" fill="#5AB4FF" fill-opacity=".16" stroke="#5AB4FF" stroke-opacity=".4" stroke-width="${k}"/><circle class="me-dot" cx="${P[0]}" cy="${P[1]}" r="${8 * k}" fill="#5AB4FF" stroke="#fff" stroke-width="${3 * k}"/>`;
    return { svg: `<svg class="holemap" viewBox="${b[0]} ${b[1]} ${w} ${h}" preserveAspectRatio="xMidYMid meet">${s}</svg>`, Ti };
  }


  function courseSvg(g, m, Wpx, Hpx) {
    const r = resolve(m), T = p => [p[0], -p[1]];
    const holes = g.holes.filter(h => m.holes.includes(h.id));
    const all = [...g.outline.flat(), ...holes.flatMap(h => h.pts)].map(T);
    let b = all.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    b = [b[0] - 30, b[1] - 30, b[2] + 30, b[3] + 30];
    let w = b[2] - b[0], h = b[3] - b[1]; const ar = Wpx / Hpx;
    if (w / h < ar) { const nw = h * ar; b[0] -= (nw - w) / 2; w = nw; } else { const nh = w / ar; b[1] -= (nh - h) / 2; h = nh; }
    const k = Math.max(w / Wpx, h / Hpx);
    let s = `<rect x="${b[0]}" y="${b[1]}" width="${w}" height="${h}" fill="#0f1511"/>` + featuresSvg(g, T, b, k);
    holes.forEach(gh => {
      const own = r.owner[gh.id], p = own && pl(own), col = p ? p.color : "#2a312b";
      s += `<polyline points="${polyStr(gh.pts, T)}" fill="none" stroke="${p ? p.color : "rgba(255,255,255,.6)"}" stroke-width="${2.2 * k}" stroke-linecap="round" opacity=".9"/>`;
      const t = T(gh.tee);
      s += `<g><circle cx="${t[0]}" cy="${t[1]}" r="${12 * k}" fill="${col}" stroke="${gh.id === m.cur ? "#fff" : "rgba(0,0,0,.4)"}" stroke-width="${2 * k}"/><text x="${t[0]}" y="${t[1] + 4 * k}" text-anchor="middle" font-size="${11 * k}" font-weight="800" fill="${p ? p.ink : "#fff"}">${gh.ref}</text></g>`;
    });
    if (lastFix && !lastFix.offCourse) { const p = T(lastFix.P); s += `<circle class="me-dot" cx="${p[0]}" cy="${p[1]}" r="${7 * k}" fill="#5AB4FF" stroke="#fff" stroke-width="${2.5 * k}"/>`; }
    return `<svg class="coursemap" viewBox="${b[0]} ${b[1]} ${w} ${h}">${s}</svg>`;
  }

  // ---------- sheet ----------
  function closeSheet() { sheetRoot.innerHTML = ""; }
  function sheet(html) {
    sheetRoot.innerHTML = `<div class="scrim"></div><div class="sheet"><div class="grabber"></div>${html}</div>`;
    $(".scrim", sheetRoot).onclick = closeSheet;
  }

  // ---------- welcome ----------
  // PWA install: Android/Chrome gets a real prompt, iPhone Safari gets the Add to Home Screen hint.
  let deferredInstall = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; paintInstall(); });
  window.addEventListener("appinstalled", () => { deferredInstall = null; paintInstall(); toast("Installed. Find Fairway Conquest on your home screen."); });
  function installHtml() {
    if (standalone()) return "";
    if (deferredInstall) return `<button class="install-btn" data-instbtn>${ic("download")}<span><b>Install the app</b><em>Full screen, works offline on the course</em></span></button>`;
    if (isIOS) return `<div class="install-ios">${ic("share")}<span><b>Get the app:</b> tap <b>Share</b>, then <b>Add to Home Screen</b>.</span></div>`;
    return "";
  }
  function paintInstall() {
    document.querySelectorAll("[data-install]").forEach(el => {
      el.innerHTML = installHtml();
      const b = el.querySelector("[data-instbtn]");
      if (b) b.onclick = async () => { const d = deferredInstall; if (!d) return; d.prompt(); try { await d.userChoice; } catch (e) {} deferredInstall = null; paintInstall(); };
    });
  }

  function showOnboarding() {
    overlayRoot.innerHTML = `<div class="onb" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div class="onb-bg" aria-hidden="true"></div>
      <div class="onb-top"><div class="onb-brand"><span class="brand-mark sm">${ic("flag", "#04130a")}</span>Fairway Conquest</div>
        <h1 class="onb-title" id="onb-title">Own the<br><span>course.</span></h1></div>
      <div class="onb-body">
        <p class="onb-sub">Head-to-head on a real course. Win a hole, it's yours. Win by two, steal one.</p>
        <button class="onb-cta" id="onb-go">Start a match</button>
        <div data-install class="onb-install">${installHtml()}</div>
        <a class="onb-link" id="onb-how" href="#rules">How it works</a>
      </div></div>`;
    const done = () => { S.onboarded = true; save(); };
    $("#onb-go").onclick = () => { done(); overlayRoot.innerHTML = ""; location.hash = "#new"; };
    $("#onb-how").onclick = () => { done(); };
    paintInstall();
  }

  // ---------- HOME ----------
  function header(title, eyebrow = "", right = "") {
    return `<header class="hdr"><div style="min-width:0">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1 class="h1">${title}</h1></div><div class="hdr-r">${right}</div></header>`;
  }
  function renderHome() {
    const m = M();
    let main;
    if (m && !m.done) {
      const r = resolve(m), b = mBoard(m), h = b.holes[m.cur];
      main = `<section class="live card">
        <div class="live-top"><span class="live-tag"><i></i>Live match</span>${synced(m) ? `<span data-net>${netChipHtml()}</span>` : `<span class="muted sm">${esc(shortName(b.name))}</span>`}</div>
        <div class="live-hole">Hole ${h ? h.ref : "—"} <span>· ${r.played.length} of ${m.holes.length} played${synced(m) ? " · " + esc(shortName(b.name)) : ""}</span></div>
        ${scoreboard(m, r)}
        <div class="live-board terrain">${hexBoard(m)}</div>
        <div class="row2"><a class="btn primary" href="#play">Resume</a><a class="btn ghost" href="#cart">${ic("cart")}Cart display</a></div>
      </section>`;
    } else {
      main = `<section class="hero">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="eyebrow sun">Head-to-head · real courses</div>
        <h1 class="hero-title">Play your friends.<br><span>Take the course.</span></h1>
        <p>Every hole is territory. Most holes wins.</p>
        <a class="btn primary big" href="#new">${ic("plus")}New match</a>
      </section>`;
    }
    const hist = S.history.slice(0, 5);
    view.innerHTML = `<div class="screen">
      <header class="hdr"><div class="brand"><div class="brand-mark">${ic("flag", "#04130a")}</div><b>Fairway Conquest</b></div>
        <div class="hdr-r"><a class="icon-btn" href="#rules" aria-label="How it works">${ic("help")}</a></div></header>
      ${main}
      ${m && !m.done ? "" : `<div class="ways">
        <a class="way" href="#new"><div class="way-ic">${ic("phone")}</div><b>Phone vs phone</b><span>Your friend scans a code. Scores sync live.</span></a>
        <a class="way" href="#cart"><div class="way-ic sun">${ic("cart")}</div><b>On the cart</b><span>Big-screen mode for cart monitors.</span></a></div>`}
      ${emailCard("home")}
      ${hist.length ? `<div class="sect"><h2 class="h2">Recent matches</h2></div><div class="list">${hist.map(x => `<div class="li"><div class="li-ic" style="background:${x.color}">${ic("trophy", x.ink)}</div><div class="li-main"><b>${esc(x.title)}</b><span>${esc(x.sub)}${x.money ? ` · ${esc(x.money)}` : ""}</span></div></div>`).join("")}</div>` : ""}
      <div data-install class="home-install">${installHtml()}</div>
      <p class="fineprint">Scores and stakes live on your phones. Course maps © OpenStreetMap contributors.</p>
    </div>`;
    bindTips(view); paintInstall();
    if (!S.onboarded) showOnboarding();
  }

  // ---------- NEW MATCH ----------
  function renderNew() {
    const d = S.draft, b = d.boardKey && S.boards[d.boardKey];
    const boards = Object.values(S.boards);
    const quickLeft = QUICK.filter(q => !boards.some(x => x.courseKey === `${q.type}/${q.id}`));
    const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button class="${v === cur ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div>`;
    const nh = b ? holeIds(b).length : 0;
    view.innerHTML = `<div class="screen new">
      ${header("New match", "", `<a class="icon-btn" href="#home" aria-label="Close">${ic("close")}</a>`)}
      <div class="step"><span class="step-n">1</span><h2 class="h2">Course</h2></div>
      <div class="list">
        ${boards.map(x => `<button class="li pick ${x.key === d.boardKey ? "sel" : ""}" data-board="${esc(x.key)}"><div class="li-ic">${ic(x.kind === "osm" ? "pin" : "flag")}</div><div class="li-main"><b>${esc(shortName(x.name))}</b><span>${holeIds(x).length} holes · Par ${parOf(x)}${x.kind === "osm" ? " · GPS yardages" : " · no map"}</span></div><span class="radio"></span></button>`).join("")}
        ${quickLeft.map(q => `<button class="li pick" data-quick="${q.id}"><div class="li-ic">${ic("pin")}</div><div class="li-main"><b>${esc(shortName(q.name))}</b><span>${esc(q.area)} · GPS yardages</span></div><span class="radio"></span></button>`).join("")}
        <a class="li ghosty" href="#courses"><div class="li-ic">${ic("search")}</div><div class="li-main"><b>Find any course</b><span>Synced from OpenStreetMap</span></div>${ic("chev")}</a>
      </div>
      ${nh > 9 ? `<div class="pad mt8">${seg("range", [["all", nh + " holes"], ["front", "Front 9"], ["back", "Back 9"]], d.range)}</div>` : ""}
      <div class="step"><span class="step-n">2</span><h2 class="h2">Players</h2></div>
      <div class="list">${d.players.map((p, i) => `<div class="li pl"><i class="pdot lg" style="background:${COLORS[i]}"></i><input data-pname="${i}" value="${esc(p.name)}" placeholder="${i ? "Friend's name" : "Your name"}" maxlength="16" autocomplete="off">${i > 1 ? `<button class="x" data-prm="${i}" aria-label="Remove">${ic("close")}</button>` : ""}</div>`).join("")}
        ${d.players.length < 4 ? `<button class="li ghosty" id="addp"><div class="li-ic">${ic("plus")}</div><div class="li-main"><b>Add a player</b><span>Up to 4. Same rules, more chaos.</span></div></button>` : ""}</div>
      <div class="pad mt8">${seg("mode", [["local", "One phone"], ["invite", "Each on own phone"]], d.mode)}</div>
      ${d.mode === "invite" ? `<div class="note">${ic("qr")}<span><b>Live on two phones.</b> After you start, your friend scans a QR code to join. Each phone enters its own score; territory and stakes sync live. No accounts.</span></div>` : ""}
      <div class="step"><span class="step-n">3</span><h2 class="h2">Stakes <span class="opt">optional</span></h2></div>
      <div class="pad">${seg("stake", [["none", "None"], ["hole", "Per hole"], ["match", "Match"], ["both", "Both"]], d.stake.type)}</div>
      ${d.stake.type !== "none" ? `<div class="stakes-set">
        ${d.stake.type !== "match" ? `<div class="amt"><span>Per hole won</span><div class="stepper"><button data-amt="hole:-1">−</button><b>$${d.stake.hole}</b><button data-amt="hole:1">+</button></div></div>` : ""}
        ${d.stake.type !== "hole" ? `<div class="amt"><span>Match winner</span><div class="stepper"><button data-amt="match:-1">−</button><b>$${d.stake.match}</b><button data-amt="match:1">+</button></div></div>` : ""}
        <div class="track">${ic("dollar")}Tracking only for now. No money moves in the app.</div></div>` : ""}
      <div class="sticky"><button class="btn primary big block" id="start" ${b ? "" : "disabled"}>${b ? "Start match" : "Pick a course"}</button></div>
    </div>`;
    view.querySelectorAll("[data-board]").forEach(x => x.onclick = () => { d.boardKey = x.dataset.board; d.range = "all"; save(); renderNew(); });
    view.querySelectorAll("[data-quick]").forEach(x => x.onclick = () => loadQuick(QUICK.find(q => q.id === +x.dataset.quick)));
    view.querySelectorAll("[data-pname]").forEach(x => x.oninput = () => { d.players[+x.dataset.pname].name = x.value; save(); });
    view.querySelectorAll("[data-prm]").forEach(x => x.onclick = () => { d.players.splice(+x.dataset.prm, 1); save(); renderNew(); });
    const ap = $("#addp"); if (ap) ap.onclick = () => { d.players.push({ name: "" }); save(); renderNew(); };
    view.querySelectorAll("[data-seg]").forEach(sg => sg.querySelectorAll("button").forEach(x => x.onclick = () => {
      const k = sg.dataset.seg, v = x.dataset.v; if (k === "stake") d.stake.type = v; else d[k] = v; save(); renderNew(); }));
    const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
    view.querySelectorAll("[data-amt]").forEach(x => x.onclick = () => { const [k, dir] = x.dataset.amt.split(":"); const i = STEPS.indexOf(d.stake[k]); d.stake[k] = STEPS[Math.max(0, Math.min(STEPS.length - 1, (i < 0 ? 2 : i) + +dir))]; save(); renderNew(); });
    $("#start").onclick = () => {
      if (!b) return;
      if (d.players.slice(1).some(p => !p.name.trim())) { toast("Add your friend's name."); view.querySelector('[data-pname="1"]').focus(); return; }
      emailGate(() => { newMatch(d); netBoot(); location.hash = synced() ? "#invite" : "#play"; });
    };
  }
  async function loadQuick(q) {
    const key = `${q.type}/${q.id}`;
    let c = getCourse(key);
    if (!c) {
      overlayRoot.innerHTML = `<div class="busy"><div class="spinner big"></div><b>${esc(q.name)}</b><span>Loading the course map…</span></div>`;
      try { const r = await fetch(`data/${q.type}-${q.id}.json`); c = OSM.parseCourse(await r.json(), { key, name: q.name, area: q.area, source: "snapshot" }); saveCourse(c); }
      catch (e) { overlayRoot.innerHTML = ""; toast("Couldn't load that course."); return; }
      overlayRoot.innerHTML = "";
    }
    if (!c.loops.length) return noHolesSheet(c);
    if (c.loops.length > 1) return pickLoopSheet(c);
    useBoard(buildBoard(c, c.loops[0].id));
  }
  function useBoard(b) { S.draft.boardKey = b.key; S.draft.range = "all"; save(); if (location.hash !== "#new") location.hash = "#new"; else renderNew(); }

  // ---------- course search (OpenStreetMap) ----------
  let searchState = { q: "", label: "", list: null, busy: false, err: null };
  function renderCourses() {
    view.innerHTML = `<div class="screen">
      ${header("Find a course", "OpenStreetMap", `<a class="icon-btn" href="#new" aria-label="Back">${ic("back")}</a>`)}
      <form class="search" id="sform"><input id="q" type="search" placeholder="Course name or town…" value="${esc(searchState.q)}" autocomplete="off" enterkeyhint="search"><button class="btn primary small" type="submit">Search</button></form>
      <div class="pad mt8"><button class="btn ghost block" id="near">${ic("pin")}Courses near me</button></div>
      <div id="sres">${resultsHtml()}</div>
      <p class="fineprint">Coverage varies: some courses have every hole mapped, some have none. No holes mapped? You can still play: set it up by hand.<br><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" class="link">Map data © OpenStreetMap contributors (ODbL)</a></p>
    </div>`;
    $("#sform").onsubmit = e => { e.preventDefault(); const q = $("#q").value.trim(); if (q.length < 3) { toast("Type at least 3 letters."); return; } doSearch(() => OSM.search(q), q); };
    $("#near").onclick = () => {
      if (!navigator.geolocation || !window.isSecureContext) { toast("Near me needs GPS over https. Try a search instead."); return; }
      searchState = { ...searchState, busy: true, err: null, label: "Finding you…" }; paintResults();
      navigator.geolocation.getCurrentPosition(p => doSearch(() => OSM.coursesNear(p.coords.latitude, p.coords.longitude, 25000).then(list => ({ label: "Courses within 25 km", list })), ""),
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
    root.querySelectorAll("[data-osm]").forEach(b => b.onclick = () => { const [t, id] = b.dataset.osm.split("/"); syncCourse(t, +id, { name: b.dataset.name, area: b.dataset.area, center: [+b.dataset.lat, +b.dataset.lon] }); });
  }
  async function syncCourse(type, id, meta) {
    overlayRoot.innerHTML = `<div class="busy"><div class="spinner big"></div><b>${esc(meta.name)}</b><span id="ostatus2">Pulling holes and greens from OpenStreetMap…</span><button class="btn ghost small" id="cancelsync" style="margin-top:10px">Cancel</button></div>`;
    $("#cancelsync").onclick = () => OSM.cancel();
    OSM.onStatus(t => { const el = $("#ostatus2"); if (el) el.textContent = t; });
    let c;
    try { c = await OSM.loadCourse(type, id, meta); }
    catch (e) { overlayRoot.innerHTML = ""; toast(e.message === "cancelled" ? "Sync cancelled." : "Couldn't reach OpenStreetMap (free servers are busy). Try again in a minute."); return; }
    overlayRoot.innerHTML = "";
    saveCourse(c);
    if (!c.loops.length) return noHolesSheet(c);
    if (c.loops.length > 1) return pickLoopSheet(c);
    useBoard(buildBoard(c, c.loops[0].id));
  }
  function pickLoopSheet(c) {
    sheet(`<div class="eyebrow">${esc(c.name)}</div><h2 class="h1 sm">Which course?</h2>
      <div class="list flush">${c.loops.map(l => `<button class="li" data-loop="${l.id}"><div class="li-ic">${l.holes.length}</div><div class="li-main"><b>${esc(l.name)}</b><span>Par ${l.holes.reduce((a, h) => a + h.par, 0)} · ${l.holes.reduce((a, h) => a + h.yards, 0).toLocaleString()} yds</span></div>${ic("chev")}</button>`).join("")}</div>`);
    sheetRoot.querySelectorAll("[data-loop]").forEach(b => b.onclick = () => { closeSheet(); useBoard(buildBoard(c, b.dataset.loop)); });
  }
  function noHolesSheet(c) {
    sheet(`<div class="eyebrow">${esc(c.name)}</div><h2 class="h1 sm">No holes mapped yet</h2>
      <p class="muted">OpenStreetMap has this course but not its holes, so no GPS yardages. You can still play the match: set it up by hand (every hole par 4, edit as you go).</p>
      <div class="row2"><button class="btn primary" id="man18">18 holes</button><button class="btn ghost" id="man9">9 holes</button></div>`);
    $("#man18").onclick = () => { closeSheet(); useBoard(buildBoard(c, null, 18)); };
    $("#man9").onclick = () => { closeSheet(); useBoard(buildBoard(c, null, 9)); };
  }

  // ---------- LIVE SYNC (two phones) ----------
  // Each cell (hole x player) carries a last-write stamp (st) and a first-write stamp (fs).
  // Merging two copies keeps the newest value per cell, so both phones converge whatever order messages arrive in.
  const synced = (m = M()) => !!(m && m.mode === "invite" && m.net);
  const myPid = (m = M()) => (m && m.net && m.net.myPid) || "p1";
  function setCell(m, hid, pid, val, ts = Date.now()) {
    m.st = m.st || {}; m.fs = m.fs || {};
    (m.scores[hid] = m.scores[hid] || {})[pid] = val;
    const k = hid + ":" + pid; m.st[k] = ts; if (!m.fs[k]) m.fs[k] = ts;
  }
  const holeDone = (m, hid) => !!(m.scores[hid] && m.players.every(p => m.scores[hid][p.id] != null));
  /** Synced matches order the log by when each hole was first completed, so both phones replay steals identically. */
  function ordLog(m) {
    if (!synced(m)) return;
    const b = mBoard(m), fs = m.fs || {};
    const ft = h => Math.max(0, ...m.players.map(p => fs[h + ":" + p.id] || 0));
    m.log = [...new Set(m.log)].sort((a, c) => ft(a) - ft(c) || b.holes[a].ref - b.holes[c].ref);
  }
  const nextMine = m => synced(m) ? m.holes.find(h => !(m.scores[h] && m.scores[h][myPid(m)] != null)) : nextOpen(m);
  const pub = m => { const { net, cur, ...rest } = m; return JSON.parse(JSON.stringify(rest)); };
  function merge(L, R) {
    let ch = false; L.st = L.st || {}; L.fs = L.fs || {};
    const Rst = R.st || {}, Rfs = R.fs || {};
    for (const hid of Object.keys(R.scores || {})) for (const pid of Object.keys(R.scores[hid])) {
      const k = hid + ":" + pid, rt = Rst[k] || 0, lt = L.st[k] || 0, lv = L.scores[hid] && L.scores[hid][pid], rv = R.scores[hid][pid];
      if (rv == null) continue;
      if (lv == null || rt > lt) { if (lv !== rv || rt !== lt) { (L.scores[hid] = L.scores[hid] || {})[pid] = rv; L.st[k] = rt; ch = true; } }
      if (Rfs[k] && (!L.fs[k] || Rfs[k] < L.fs[k])) { L.fs[k] = Rfs[k]; ch = true; }
    }
    (R.log || []).forEach(h => { if (!L.log.includes(h)) { L.log.push(h); ch = true; } });
    if (NET.role() === "guest") {                       // host owns the roster, seats and stakes
      if (JSON.stringify(L.players) !== JSON.stringify(R.players)) { L.players = R.players; ch = true; }
      if (JSON.stringify(L.seats || {}) !== JSON.stringify(R.seats || {})) { L.seats = R.seats || {}; ch = true; }
      if (JSON.stringify(L.stake) !== JSON.stringify(R.stake)) { L.stake = R.stake; ch = true; }
    }
    if (R.done && !L.done) { L.done = true; ch = true; }
    return ch;
  }
  function pushState() { const m = M(); if (synced(m)) NET.send({ t: "state", match: pub(m) }); }
  function courseFor(m) {
    const b = mBoard(m); if (!b || b.kind !== "osm") return null;
    if (QUICK.some(q => `${q.type}/${q.id}` === b.courseKey)) return null;      // guest loads preloaded courses from its own copy
    return getCourse(b.courseKey);
  }
  function applyRemote(R, from) {
    const m = M(); if (!m || m.id !== R.id) return;
    const before = new Set(resolve(m).played), wasDone = m.done;
    const ch = merge(m, R);
    if (NET.role() === "host" && from) NET.reply(from, { t: "state", match: pub(m) });   // the sender may lack what we have
    if (!ch) return;
    ordLog(m); save();
    if (NET.role() === "host") NET.send({ t: "state", match: pub(m) }, from);           // relay to any other phones
    onRemoteChange(before, wasDone);
  }
  function onRemoteChange(before, wasDone) {
    const m = M(), r = resolve(m), h = location.hash;
    if (m.done && !wasDone) recordHistory(m);
    if (sheetRoot.innerHTML) return;
    if (/^#(play|cart)/.test(h)) {
      if (m.done) { overlayRoot.innerHTML = ""; location.hash = "#result"; return; }
      const fresh = r.played.filter(x => !before.has(x));
      if (fresh.length && !overlayRoot.innerHTML) {
        const hid = fresh[fresh.length - 1];
        if (m.cur === hid || holeDone(m, m.cur)) { const n = nextMine(m); if (n) m.cur = n; save(); }
        showHoleResult(m, hid, r.events.find(e => e.hole === hid), r, r.complete);
      } else repaint();
    } else if (/^#(home|map|stakes|invite|result)?$/.test(h.split("/")[0]) && !overlayRoot.innerHTML) route();
  }
  function netBoot() { const m = M(); if (!synced(m)) return; if (m.net.role === "host") NET.host(m.net.hostId); else NET.join(m.net.hostId); }
  NET.on("open", () => { if (NET.role() === "guest") { const m = M(); NET.send({ t: "hello", dev: S.dev, match: m && synced(m) && m.net.hostId === NET.hostId() ? pub(m) : null }); } });
  NET.on("msg", (d, c) => {
    if (!d || !d.t) return;
    const m = M();
    if (d.t === "hello" && NET.role() === "host" && synced(m)) {
      if (d.match && d.match.id === m.id) applyRemote(d.match, null);
      NET.reply(c, { t: "state", match: pub(m), board: mBoard(m), course: courseFor(m) });
    } else if (d.t === "state" && d.match) {
      if (NET.role() === "guest" && (!m || m.id !== d.match.id)) {
        if (pendingJoin && pendingJoin.hostId === NET.hostId()) { pendingJoin = { ...pendingJoin, match: d.match, board: d.board || pendingJoin.board, course: d.course || pendingJoin.course }; if (location.hash.startsWith("#join")) paintJoin(); }
        return;
      }
      if (d.board && !S.boards[d.board.key]) { S.boards[d.board.key] = d.board; save(); }
      if (d.course && !getCourse(d.course.key)) saveCourse(d.course);
      applyRemote(d.match, NET.role() === "host" ? c : null);
    } else if (d.t === "claim" && NET.role() === "host" && synced(m)) {
      const p = m.players.find(x => x.id === d.pid); if (!p) return;
      m.seats = m.seats || {}; m.seats[d.pid] = d.dev;
      if (d.name && d.name.trim()) p.name = d.name.trim().slice(0, 16);
      save(); NET.send({ t: "state", match: pub(m) });
      toast(`${esc(p.name)} joined the match`);
      if (/^#(invite|home|map|play)/.test(location.hash) && !overlayRoot.innerHTML && !sheetRoot.innerHTML) { if (location.hash.startsWith("#play")) repaint(); else route(); }
    }
  });
  function netChipHtml() {
    const m = M(); if (!synced(m)) return "";
    const s = NET.status(), rival = m.players.filter(p => p.id !== myPid(m)).map(p => p.name).join(", ");
    const T = { live: ["good", `Live · ${rival}`], waiting: ["ok", `Waiting for ${rival}`], connecting: ["ok", s.detail || "Connecting…"],
      reconnecting: ["ok", s.detail || "Reconnecting…"], error: ["warn", s.detail || "Offline"], off: ["warn", "Offline · saved on this phone"] };
    const [cls, t] = T[s.state] || T.off;
    return `<span class="net-chip ${cls}" title="${esc(s.detail || "")}"><i></i>${esc(t)}</span>`;
  }
  function paintNet() { document.querySelectorAll("[data-net]").forEach(el => el.innerHTML = netChipHtml()); }
  NET.on("status", () => {
    paintNet();
    if (location.hash.startsWith("#invite") && !sheetRoot.innerHTML) renderInvite();
    else if (location.hash.startsWith("#join") && pendingJoin && !pendingJoin.match) paintJoin();
  });

  // ---------- EMAIL (Kit list) ----------
  const CFG = window.FC_CONFIG || {}, PLAN = CFG.PLAN_TITLE || "30-Day Practice Plan to Break 90";
  const kitAction = () => CFG.KIT_FORM_ACTION || (CFG.KIT_FORM_ID ? `https://app.kit.com/forms/${encodeURIComponent(CFG.KIT_FORM_ID)}/subscriptions` : "");
  const SUBS = "fc.signups";
  const signups = () => { try { return JSON.parse(localStorage.getItem(SUBS)) || []; } catch (e) { return []; } };
  const saveSignups = a => { try { localStorage.setItem(SUBS, JSON.stringify(a)); } catch (e) {} };
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  /** Sends any queued signups to Kit's public form endpoint once KIT_FORM_ID is set. Until then they wait on this phone. */
  async function flushSignups() {
    const url = kitAction(); if (!url || !navigator.onLine) return;
    const a = signups(); let ch = false;
    for (const x of a) if (!x.sent) {
      try { const fd = new FormData(); fd.append("email_address", x.email); if (x.first) fd.append("first_name", x.first);
        await fetch(url, { method: "POST", mode: "no-cors", body: fd }); x.sent = Date.now(); ch = true; } catch (e) {}
    }
    if (ch) saveSignups(a);
  }
  function addSignup(first, email, ctx) {
    const a = signups().filter(x => x.email.toLowerCase() !== email.toLowerCase());
    a.push({ first, email, ctx, ts: Date.now(), sent: 0 }); saveSignups(a);
    S.optin = { first, email, ts: Date.now() }; save(); flushSignups();
  }
  function emailCard(ctx, o = {}) {
    if (S.optin) return o.hideDone ? "" : `<div class="tips card done">${ic("check")}<div><b>You're on the list${S.optin.first ? ", " + esc(S.optin.first) : ""}.</b><span>Sam's ${esc(PLAN)} goes to ${esc(S.optin.email)}.</span></div></div>`;
    return `<form class="tips card" data-tips="${ctx}" novalidate>
      <div class="tips-top"><div class="tips-ic">${ic("mail")}</div><div><div class="eyebrow sun">${o.eyebrow || "Free · golf tips"}</div><b class="tips-title">Get Sam's free ${esc(PLAN)}</b></div></div>
      <div class="tips-row"><input name="first" placeholder="First name" autocomplete="given-name" maxlength="40" aria-label="First name"><input name="email" type="email" placeholder="Email" autocomplete="email" inputmode="email" maxlength="120" aria-label="Email"></div>
      ${o.noButton ? "" : `<button class="btn primary block" type="submit">Send me the plan</button>`}
      <p class="privacy">${ic("eye")}Only Sam's golf emails. Unsubscribe anytime. Never sold or shared.</p></form>`;
  }
  function readTips(f) { return { first: f.querySelector('[name="first"]').value.trim(), email: f.querySelector('[name="email"]').value.trim() }; }
  function bindTips(root, after) {
    root.querySelectorAll("form[data-tips]").forEach(f => f.onsubmit = e => {
      e.preventDefault();
      const { first, email } = readTips(f);
      if (!validEmail(email)) { toast("That email doesn't look right."); f.querySelector('[name="email"]').focus(); return; }
      addSignup(first, email, f.dataset.tips);
      toast(`You're in${first ? ", " + esc(first) : ""}. The plan is on its way.`);
      if (after) after(); else f.outerHTML = emailCard(f.dataset.tips);
    });
  }
  /** Ask once before a new match (skippable; asks again after a week). */
  function emailGate(go) {
    if (S.optin || (S.optinSkip && Date.now() - S.optinSkip < 7 * 864e5)) return go();
    sheet(`<div class="eyebrow">Before you tee off</div><h2 class="h1 sm">Want to break 90?</h2>
      ${emailCard("create", { eyebrow: "Free · 30 days" })}
      <button class="btn ghost block mt8" id="skipmail">Skip, start the match</button>`);
    bindTips(sheetRoot, () => { closeSheet(); go(); });
    $("#skipmail").onclick = () => { S.optinSkip = Date.now(); save(); closeSheet(); go(); };
  }

  // ---------- INVITE (host) ----------
  const inviteLink = m => location.href.split("#")[0].split("?")[0] + "#join/" + m.net.hostId;
  function qrSvg(text) {
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-3 -3 ${n + 6} ${n + 6}" shape-rendering="crispEdges" role="img" aria-label="QR code for the invite link"><rect x="-3" y="-3" width="${n + 6}" height="${n + 6}" rx="3" fill="#fff"/><path d="${d}" fill="#050706"/></svg>`;
  }
  function renderInvite() {
    const m = M();
    if (!synced(m) || m.net.role !== "host") { location.hash = m ? "#play" : "#home"; return; }
    const b = mBoard(m), link = inviteLink(m), guests = m.players.filter(p => p.id !== "p1"), live = NET.status().state === "live";
    const all = guests.every(p => m.seats && m.seats[p.id]);
    view.innerHTML = `<div class="screen invite">
      ${header("Invite your rival", esc(shortName(b.name)), `<a class="icon-btn" href="#play" aria-label="Close">${ic("close")}</a>`)}
      <div class="qr-card"><div class="qr-glow"></div><div class="qr">${qrSvg(link)}</div>
        <div class="qr-cap"><b>Scan to join</b><span>Point ${esc(guests.map(p => p.name).join(" or "))}'s camera here. No app or account needed.</span></div></div>
      <div class="link-row"><input readonly value="${esc(link)}" aria-label="Invite link" id="invlink"><button class="btn ghost small" id="cpy">${ic("copy")}Copy</button>${navigator.share ? `<button class="btn ghost small" id="shr">${ic("share")}</button>` : ""}</div>
      <div class="seats list">${guests.map(p => { const j = m.seats && m.seats[p.id];
        return `<div class="li"><i class="pdot lg" style="background:${p.color}"></i><div class="li-main"><b>${esc(p.name)}</b><span>${j ? (live ? "Joined · connected" : "Joined · reconnecting") : "Not joined yet"}</span></div>${j ? `<span class="ok-ic">${ic("check")}</span>` : `<div class="spinner"></div>`}</div>`; }).join("")}</div>
      <div class="pad mt8" data-net>${netChipHtml()}</div>
      <p class="fineprint">Phones link directly (peer to peer) once both are online. Keep this phone's app open until your rival joins. Scores are saved on both phones, so a dropped signal just catches up later.</p>
      <div class="sticky col"><a class="btn primary big block" href="#play">${all ? `Tee off · hole ${b.holes[m.cur].ref}` : "Start now, they can join any time"}</a><button class="btn ghost block" id="tolocal">Play on one phone instead</button></div>
    </div>`;
    $("#cpy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Invite link copied."); } catch (e) { $("#invlink").select(); toast("Long-press to copy the link."); } };
    const sh = $("#shr"); if (sh) sh.onclick = () => navigator.share({ title: "Fairway Conquest", text: `Join my match at ${shortName(b.name)}`, url: link }).catch(() => {});
    $("#tolocal").onclick = () => { NET.stop(); m.mode = "local"; delete m.net; save(); location.hash = "#play"; };
  }

  // ---------- JOIN (guest) ----------
  let pendingJoin = null;   // {hostId, match, board, course, seat}
  function renderJoin(hostId) {
    const m = M();
    if (!hostId) { location.hash = "#home"; return; }
    if (m && m.net && m.net.hostId === hostId) { netBoot(); location.hash = m.done ? "#result" : "#play"; return; }   // rejoin
    if (!pendingJoin || pendingJoin.hostId !== hostId) { pendingJoin = { hostId }; NET.join(hostId); }
    paintJoin();
  }
  function paintJoin() {
    const pj = pendingJoin; if (!pj) return;
    if (!pj.match) {
      const s = NET.status();
      view.innerHTML = `<div class="screen join wait"><div class="join-bg" aria-hidden="true"></div>
        <div class="join-wait"><div class="spinner big"></div><div class="eyebrow sun">Invite</div><h1 class="h1">Finding the match…</h1>
        <p class="muted">${esc(s.detail || "Connecting to your friend's phone.")}</p><p class="muted sm">Ask the host to keep Fairway Conquest open on their phone.</p>
        <a class="btn ghost" href="#home">Cancel</a></div></div>`;
      return;
    }
    const R = pj.match, b = pj.board || S.boards[R.boardKey], host = R.players[0];
    if (R.done) { view.innerHTML = `<div class="screen">${header("Match over")}${emptyState("That match is finished", "Ask your friend to start a new one and send a fresh code.", "#home", "OK")}</div>`; return; }
    const open = R.players.filter(p => p.id !== "p1" && (!(R.seats || {})[p.id] || R.seats[p.id] === S.dev));
    if (!open.length) { view.innerHTML = `<div class="screen">${header("Match is full")}${emptyState("Every seat is taken", "Ask the host to add a player for you.", "#home", "OK")}</div>`; return; }
    const seat = pj.seat && open.some(p => p.id === pj.seat) ? pj.seat : open[0].id, sp = R.players.find(p => p.id === seat);
    const stakeTxt = R.stake.type === "none" ? "No stakes" : [R.stake.type !== "match" ? `$${R.stake.hole} a hole` : "", R.stake.type !== "hole" ? `$${R.stake.match} match` : ""].filter(Boolean).join(" + ") + " · tracking only";
    view.innerHTML = `<div class="screen join">
      <div class="join-hero"><div class="join-bg" aria-hidden="true"></div>
        <div class="eyebrow sun">You're invited</div>
        <h1 class="hero-title">${esc(host.name)} wants<br><span>the course.</span></h1>
        <div class="join-meta"><span>${ic("pin")}${esc(shortName(b ? b.name : "A real course"))}</span><span>${ic("flag")}${R.holes.length} holes</span><span>${ic("dollar")}${esc(stakeTxt)}</span></div>
        <div data-net class="mt8">${netChipHtml()}</div></div>
      ${open.length > 1 ? `<div class="step"><span class="step-n">1</span><h2 class="h2">Who are you?</h2></div><div class="list">${open.map(p => `<button class="li pick ${p.id === seat ? "sel" : ""}" data-seat="${p.id}"><i class="pdot lg" style="background:${p.color}"></i><div class="li-main"><b>${esc(p.name)}</b></div><span class="radio"></span></button>`).join("")}</div>` : ""}
      <div class="step"><span class="step-n">${open.length > 1 ? 2 : 1}</span><h2 class="h2">Your name</h2></div>
      <div class="list"><div class="li pl"><i class="pdot lg" style="background:${sp.color}"></i><input id="jname" value="${esc(sp.name)}" placeholder="Your name" maxlength="16" autocomplete="given-name"></div></div>
      <div class="step"><span class="step-n">${open.length > 1 ? 3 : 2}</span><h2 class="h2">Golf tips <span class="opt">optional</span></h2></div>
      ${emailCard("join", { noButton: true, hideDone: true, eyebrow: "Free · optional" }) || `<div class="tips card done">${ic("check")}<div><b>You're on Sam's list.</b><span>Nothing else needed.</span></div></div>`}
      <div class="sticky"><button class="btn primary big block" id="dojoin">Join the match</button></div>
    </div>`;
    view.querySelectorAll("[data-seat]").forEach(x => x.onclick = () => { pj.seat = x.dataset.seat; paintJoin(); });
    $("#dojoin").onclick = () => doJoin(seat);
  }
  async function doJoin(seat) {
    const pj = pendingJoin, R = JSON.parse(JSON.stringify(pj.match)), b = pj.board || S.boards[R.boardKey];
    const name = ($("#jname").value || "").trim().slice(0, 16);
    const f = view.querySelector("form[data-tips]");
    if (f) { const { first, email } = readTips(f); if (email) { if (validEmail(email)) addSignup(first || name, email, "join"); else toast("Email skipped: it didn't look right."); } }
    if (b) S.boards[b.key] = b;
    if (pj.course) saveCourse(pj.course);
    else if (b && b.kind === "osm" && !getCourse(b.courseKey)) {
      const q = QUICK.find(x => `${x.type}/${x.id}` === b.courseKey);
      if (q) { try { const r = await fetch(`data/${q.type}-${q.id}.json`); saveCourse(OSM.parseCourse(await r.json(), { key: b.courseKey, name: q.name, area: q.area, source: "snapshot" })); } catch (e) {} }
    }
    if (name) R.players.find(p => p.id === seat).name = name;
    R.seats = R.seats || {}; R.seats[seat] = S.dev;
    R.net = { role: "guest", hostId: pj.hostId, myPid: seat };
    S.match = R; R.cur = nextMine(R) || R.holes[0]; S.onboarded = true; playEdit = null; save();
    NET.send({ t: "claim", pid: seat, dev: S.dev, name });
    pendingJoin = null; geo._k = null;
    location.hash = "#play";
  }

  // ---------- PLAY (hole entry) ----------
  let playEdit = null;   // {holeId, vals:{pid:n}} while entering
  function editVals(m, hid) {
    if (!playEdit || playEdit.hole !== hid) {
      const par = mBoard(m).holes[hid].par, sc = m.scores[hid] || {};
      playEdit = { hole: hid, vals: Object.fromEntries(m.players.map(p => [p.id, sc[p.id] ?? par])) };
    }
    return playEdit.vals;
  }
  function holeStatus(m, r, hid) {
    const o = r.owner[hid], sc = m.scores[hid];
    if (o) return `${dot(pl(o))}<span><b>${esc(pl(o).name)}</b> ${r.how[hid] === "stolen" ? "stole it" : "owns it"}${holeDone(m, hid) ? "" : " · win it back"}</span>`;
    if (holeDone(m, hid) && r.events.find(e => e.hole === hid && e.tie)) return `<span>Halved. Nobody owns it.</span>`;
    if (synced(m) && sc && sc[myPid(m)] != null) return `<span><b>Your ${sc[myPid(m)]} is in.</b> Waiting on ${esc(m.players.filter(p => sc[p.id] == null).map(p => p.name).join(", "))}.</span>`;
    return `<span><b>Open hole.</b> Low score claims it. Win by 2+ to steal a neighbor.</span>`;
  }
  function entryRows(m, hid, big = false) {
    const par = mBoard(m).holes[hid].par, vals = editVals(m, hid), sy = synced(m), me = myPid(m), sc = m.scores[hid] || {};
    return m.players.map(p => {
      if (sy && p.id !== me) {
        const v = sc[p.id];
        return `<div class="entry ro ${big ? "big" : ""}" style="--pc:${p.color}"><div class="e-name">${dot(p)}<span>${esc(p.name)}</span><em>their phone</em></div>
          <div class="ro-val">${v != null ? `<b>${v}</b><span>${scoreName(v, par)}</span>` : `<i class="dots"><s></s><s></s><s></s></i><span>Waiting</span>`}</div></div>`;
      }
      return `<div class="entry ${big ? "big" : ""}" style="--pc:${p.color}"><div class="e-name">${dot(p)}<span>${esc(p.name)}</span>${sy ? "<em>you</em>" : ""}</div>
      <button class="sbtn" data-dec="${p.id}" aria-label="Minus">−</button>
      <div class="sval"><b>${vals[p.id]}</b><span>${scoreName(vals[p.id], par)}</span></div>
      <button class="sbtn" data-inc="${p.id}" aria-label="Plus">+</button></div>`; }).join("");
  }
  function bindEntry(root, m, hid) {
    const par = mBoard(m).holes[hid].par, vals = editVals(m, hid);
    root.querySelectorAll("[data-dec]").forEach(x => x.onclick = () => { const k = x.dataset.dec; if (vals[k] > 1) { vals[k]--; repaint(false); } });
    root.querySelectorAll("[data-inc]").forEach(x => x.onclick = () => { const k = x.dataset.inc; if (vals[k] < par + 6) { vals[k]++; repaint(false); } });
    root.querySelectorAll("[data-save]").forEach(x => x.onclick = () => saveHole(m, hid));
    root.querySelectorAll("[data-hs]").forEach(x => x.onclick = () => { m.cur = x.dataset.hs; GPS.setHole(m.cur); playEdit = null; tapPt = null; save(); repaint(); });
  }
  function holeStrip(m, r) {
    return m.holes.map(id => { const o = r.owner[id], p = o && pl(o), done = holeDone(m, id), half = !done && !!m.scores[id];
      return `<button class="hs ${id === m.cur ? "cur" : ""} ${done ? "done" : ""} ${half ? "half" : ""}" data-hs="${id}" style="--oc:${p ? p.color : "transparent"}">${id.slice(1)}</button>`; }).join("");
  }
  function saveHole(m, hid) {
    const vals = editVals(m, hid), sy = synced(m), me = myPid(m);
    m.players.forEach(p => { if (!sy || p.id === me) setCell(m, hid, p.id, vals[p.id]); });
    if (!m.log.includes(hid)) m.log.push(hid);
    ordLog(m);
    const r = resolve(m), ev = r.events.find(e => e.hole === hid), complete = holeDone(m, hid);
    playEdit = null;
    const nxt = nextMine(m); if (nxt) m.cur = nxt;
    save(); pushState();
    if (complete) showHoleResult(m, hid, ev, r, r.complete);
    else { toast(`Saved. Waiting on ${esc(m.players.filter(p => m.scores[hid][p.id] == null).map(p => p.name).join(", "))}.`); repaint(); }
  }
  function showHoleResult(m, hid, ev, r, last) {
    const h = mBoard(m).holes[hid], w = ev && ev.winner && pl(ev.winner);
    const stake = (m.stake.type === "hole" || m.stake.type === "both") && w ? `<div class="res-money">${ic("dollar")}<span>+$${m.stake.hole * (m.players.length - 1)} to ${esc(w.name)}</span><em>tracking only</em></div>` : "";
    const nx = mBoard(m).holes[m.cur];
    overlayRoot.innerHTML = `<div class="cap" style="--pc:${w ? w.color : "#8a948a"}"><div class="cap-rays"></div><div class="cap-glow"></div>
      <div class="cap-body">
        <svg class="cap-hex" viewBox="0 0 120 130"><defs><filter id="capf" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <polygon points="${hexPts(60, 65, 50)}" fill="${w ? w.color : "rgba(255,255,255,.08)"}" fill-opacity="${w ? .9 : 1}" stroke="${w ? "#fff" : "rgba(255,255,255,.5)"}" stroke-opacity=".7" stroke-width="2.5" filter="url(#capf)"/>
          <text x="60" y="80" text-anchor="middle" font-size="44" font-weight="900" font-style="italic" fill="${w ? w.ink : "#fff"}">${h.ref}</text></svg>
        <div class="eyebrow">${w ? (ev.retook ? "Taken back" : "Captured") : "Halved"}</div>
        <h2 class="cap-title">${w ? `${esc(w.name)} takes <span>#${h.ref}</span>` : `#${h.ref} stays open`}</h2>
        <p class="cap-scores">${m.players.map(p => `<span style="--pc:${p.color}">${dot(p)}${esc(p.name)} <b>${m.scores[hid][p.id]}</b></span>`).join("")}</p>
        ${ev && ev.steal ? `<div class="res-steal">${ic("swords")}<span><b>Won by ${ev.margin}. Steal!</b> ${esc(w.name)} also grabs #${ev.steal.slice(1)} from ${esc(pl(ev.stoleFrom).name)}.</span></div>` : ""}
        ${stake}
        ${scoreboard(m, r)}
        <button class="btn primary big block" id="cap-ok">${last ? "See the result" : nx && !holeDone(m, m.cur) ? `Hole ${nx.ref} →` : "Back to the match"}</button>
      </div></div>`;
    $("#cap-ok").onclick = () => { overlayRoot.innerHTML = ""; if (last) finishMatch(); else repaint(); };
  }
  function renderPlay() {
    const m = M();
    if (!m) { view.innerHTML = `<div class="screen">${header("Play")}${emptyState("No match running", "Start one, pick a course, add a friend.", "#new", "New match")}</div>`; return; }
    if (m.done) { location.hash = "#result"; return; }
    view.innerHTML = `<div class="play" id="play"></div>`;
    paintPlay();
  }
  /** The live hole: a floating 3D slab of the real hole map, rimmed in the owner's glow (green = you, gold = rival). */
  function paintPlay() {
    const root = $("#play"); if (!root) return;
    const m = M(), b = mBoard(m), r = resolve(m), hid = m.cur, h = b.holes[hid], y = yardsFor(hid), g = geo(), gh = geoHole(g, hid);
    const own = r.owner[hid] && pl(r.owner[hid]), glow = own ? own.color : "rgba(190,255,220,.55)";
    const mine = synced(m) ? (m.scores[hid] || {})[myPid(m)] != null : !!m.scores[hid];
    root.innerHTML = `
      <div class="play-top"><div style="min-width:0"><div class="eyebrow">${esc(shortName(b.name))}</div></div>
        <div class="hdr-r">${g ? gpsChip() : ""}<a class="icon-btn" href="#cart" aria-label="Cart display">${ic("cart")}</a><button class="icon-btn" id="pmenu" aria-label="Match menu">${ic("more")}</button></div></div>
      ${scoreboard(m, r)}
      ${synced(m) ? `<div class="play-net" data-net>${netChipHtml()}</div>` : ""}
      <div class="hole-strip" id="strip">${holeStrip(m, r)}</div>
      <div class="stage ${own ? "owned" : "open"}" style="--gc:${glow}">
        <div class="hole-title"><b>Hole ${h.ref}</b><span>Par ${h.par}${h.yards ? ` · ${h.yards} yds` : ""}</span>${own ? `<em style="color:${own.color}">${esc(own.name)}'s</em>` : `<em>Open</em>`}</div>
        <div class="stage-glow"></div>
        ${gh ? `<div class="slab-wrap"><div class="slab">${"<i></i>".repeat(6)}<div class="slab-top" id="slab"></div></div></div>` : `<img class="diorama" src="assets/hole-diorama.webp" alt="" width="720" height="458">`}
        ${y ? `<div class="yards"><div class="yd main"><b>${yd(y.center)}</b><span>yds<br><em>${y.fromTee ? "from tee" : "to green"}</em></span></div>
          <div class="yd-fb"><div class="yd side"><span>Back</span><b>${y.back == null ? "—" : yd(y.back)}</b></div><div class="yd side"><span>Front</span><b>${y.front == null ? "—" : yd(y.front)}</b></div></div></div>` : ""}
      </div>
      <div class="status">${holeStatus(m, r, hid)}</div>
      <div class="entries">${entryRows(m, hid)}</div>
      <button class="btn primary big block save" data-save>${mine ? (synced(m) ? "Update my score" : "Update hole " + h.ref) : (synced(m) ? "Lock in my score" : "Save hole " + h.ref)}</button>
      <div class="play-foot">${g ? `<button class="mini" id="sim">${ic("redo")}${GPS.G.mode === "sim" ? "Stop GPS sim" : "Simulate GPS"}</button>` : ""}<a class="mini" href="#map">${ic("map")}Territory</a>${m.stake.type !== "none" ? `<a class="mini" href="#stakes">${ic("dollar")}Stakes</a>` : ""}</div>`;
    if (gh) { const el = $("#slab"); el.innerHTML = holeSvg(g, gh, 230, 300, { bg: "#173a24" }).svg; }
    bindEntry(root, m, hid); bindGps(root);
    const strip = $("#strip"), cur = strip.querySelector(".cur"); if (cur) strip.scrollLeft = Math.max(0, cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2);
    const sim = $("#sim"); if (sim) sim.onclick = () => { if (GPS.G.mode === "sim") { GPS.stop(); toast("Simulation stopped."); return; } GPS.setAuto(true); GPS.D.holeId = m.cur; GPS.startSim(simPath(g, m.cur), { metersPerTick: 20, ms: 1000 }); toast("Simulating GPS along the real hole."); };
    $("#pmenu").onclick = () => matchMenu(m);
  }
  function matchMenu(m) {
    sheet(`<h2 class="h1 sm">Match</h2><div class="list flush">
      ${synced(m) && m.net.role === "host" ? `<a class="li" href="#invite"><div class="li-ic">${ic("qr")}</div><div class="li-main"><b>Invite code</b><span>Show the QR again</span></div>${ic("chev")}</a>` : ""}
      ${synced(m) ? `<div class="li"><div class="li-ic">${ic("wifi")}</div><div class="li-main"><b>Live link</b><span data-net>${netChipHtml()}</span></div></div>` : ""}
      <a class="li" href="#map"><div class="li-ic">${ic("map")}</div><div class="li-main"><b>Territory map</b><span>Who owns what</span></div>${ic("chev")}</a>
      <a class="li" href="#stakes"><div class="li-ic">${ic("dollar")}</div><div class="li-main"><b>Stakes</b><span>${m.stake.type === "none" ? "None set" : "Ledger and settle-up"}</span></div>${ic("chev")}</a>
      <button class="li" id="sout"><div class="li-ic">${ic("sun")}</div><div class="li-main"><b>Outdoor mode</b><span>${S.outdoor ? "On" : "Off"} · max contrast in full sun</span></div></button>
      <button class="li" id="mend"><div class="li-ic">${ic("trophy")}</div><div class="li-main"><b>End match now</b><span>Settle on the holes played so far</span></div></button></div>`);
    $("#sout").onclick = () => { S.outdoor = !S.outdoor; save(); applyOutdoor(); closeSheet(); repaint(); };
    $("#mend").onclick = () => { closeSheet(); finishMatch(); };
  }
  function recordHistory(m) {
    if (S.history.some(x => x.id === m.id)) return;
    const r = resolve(m), b = mBoard(m), lead = r.leader;
    const owe = settle(r.net).map(s => `${pl(s.from).name} → ${pl(s.to).name} ${money(s.amt)}`).join(", ");
    S.history.unshift({ id: m.id, title: lead ? `${lead.name} took ${shortName(b.name)}` : `Split ${shortName(b.name)}`, sub: `${r.table.map(t => t.holes).join("–")} holes · ${m.players.map(p => p.name).join(" v ")}`,
      money: owe, color: lead ? lead.color : "#2a312b", ink: lead ? lead.ink : "#fff" });
    S.history = S.history.slice(0, 20); save();
  }
  function finishMatch() {
    const m = M();
    if (!m.done) { m.done = true; recordHistory(m); save(); pushState(); }
    location.hash = "#result";
  }

  // ---------- MAP ----------
  let mapView = "hex";
  function renderMap() {
    const m = M();
    if (!m) { view.innerHTML = `<div class="screen">${header("Territory")}${emptyState("No territory yet", "Start a match and every hole you win turns your color.", "#new", "New match")}</div>`; return; }
    const r = resolve(m), b = mBoard(m), g = geo();
    if (!g) mapView = "hex";
    view.innerHTML = `<div class="screen terr">
      ${header("Territory", `${esc(shortName(b.name))} · ${m.done ? "final" : `${r.played.length}/${m.holes.length} played`}`, tally(m, r))}
      ${scoreboard(m, r, true)}
      ${g ? `<div class="pad mt8"><div class="seg" id="mv"><button class="${mapView === "hex" ? "on" : ""}" data-v="hex">Board</button><button class="${mapView === "course" ? "on" : ""}" data-v="course">Course</button></div></div>` : ""}
      <div class="board-card ${mapView} ${mapView === "hex" ? "terrain" : ""}">${mapView === "hex" ? hexBoard(m) : courseSvg(g, m, 366, 440)}
        ${synced(m) ? `<div class="board-net" data-net>${netChipHtml()}</div>` : ""}</div>
      <div class="legend">${m.players.map(p => `<span>${dot(p)}${esc(p.name)}</span>`).join("")}<span><i class="pdot open"></i>Open</span><span class="stolen-k">${ic("redo")}Stolen</span></div>
      ${rulesCard()}
      ${m.done ? `<div class="pad mt16"><a class="btn primary block" href="#result">See the result</a></div>` : `<div class="pad mt16"><a class="btn primary block" href="#play">Back to hole ${b.holes[m.cur].ref}</a></div>`}
    </div>`;
    const mv = $("#mv"); if (mv) mv.querySelectorAll("button").forEach(x => x.onclick = () => { mapView = x.dataset.v; renderMap(); });
    view.querySelectorAll("[data-hx]").forEach(x => x.onclick = () => holeSheet(m, x.dataset.hx));
  }
  function holeSheet(m, hid) {
    const r = resolve(m), h = mBoard(m).holes[hid], sc = m.scores[hid], o = r.owner[hid];
    sheet(`<div class="eyebrow">Hole ${h.ref} · Par ${h.par}${h.yards ? ` · ${h.yards} yds` : ""}</div><h2 class="h1 sm">${o ? `${esc(pl(o).name)} ${r.how[hid] === "stolen" ? "stole it" : "owns it"}` : holeDone(m, hid) ? "Halved" : sc ? "In progress" : "Not played yet"}</h2>
      ${sc ? `<div class="list flush">${m.players.map(p => `<div class="li"><i class="pdot lg" style="background:${p.color}"></i><div class="li-main"><b>${esc(p.name)}</b><span>${sc[p.id] != null ? scoreName(sc[p.id], h.par) : "Waiting"}</span></div><b class="big-n">${sc[p.id] ?? "—"}</b></div>`).join("")}</div>` : ""}
      ${m.done ? "" : `<button class="btn primary block mt16" id="goh">${sc ? (synced(m) ? "Edit my score" : "Edit this hole") : "Play this hole"}</button>`}`);
    const gh = $("#goh"); if (gh) gh.onclick = () => { m.cur = hid; playEdit = null; save(); closeSheet(); location.hash = "#play"; };
  }
  const rulesCard = () => `<div class="rules card"><div class="eyebrow">Rules</div>
    <div class="rule"><b>1</b><span><strong>Win a hole, claim it.</strong> Low score takes the territory. Ties stay open.</span></div>
    <div class="rule"><b>2</b><span><strong>Win by 2+, steal one.</strong> Also grab a rival hole that touches it on the board.</span></div>
    <div class="rule"><b>3</b><span><strong>Most holes takes the course.</strong> Tied? Fewest total strokes.</span></div></div>`;

  // ---------- STAKES ----------
  function renderStakes() {
    const m = M();
    if (!m) { view.innerHTML = `<div class="screen">${header("Stakes")}${emptyState("No match running", "Set a per-hole or match stake when you start one.", "#new", "New match")}</div>`; return; }
    const r = resolve(m), st = settle(r.net);
    const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
    view.innerHTML = `<div class="screen">
      ${header("Stakes", esc(shortName(mBoard(m).name)), `<span class="track-pill">Tracking only</span>`)}
      ${m.stake.type === "none" ? `<div class="empty card"><div class="empty-ic">${ic("dollar")}</div><b>No stakes on this match</b><p>Add a friendly wager. The app keeps the ledger, you settle up.</p>
        <div class="row2"><button class="btn ghost" data-st="hole">$5 a hole</button><button class="btn ghost" data-st="match">$20 match</button></div></div>`
      : `<div class="net">${m.players.map(p => `<div class="net-p" style="--pc:${p.color}">${dot(p)}<span>${esc(p.name)}</span><b class="${r.net[p.id] > 0 ? "up" : r.net[p.id] < 0 ? "down" : ""}">${r.net[p.id] > 0 ? "+" : ""}${money(r.net[p.id])}</b></div>`).join("")}</div>
        <div class="settle card"><div class="eyebrow">${m.done ? "Settle up" : "If you stopped now"}</div>
          ${st.length ? st.map(s => `<div class="owe"><span>${esc(pl(s.from).name)}</span>${ic("chev")}<span>${esc(pl(s.to).name)}</span><b>${money(s.amt)}</b></div>`).join("") : `<div class="muted">All square.</div>`}
          <div class="terms">${m.stake.type !== "match" ? `$${m.stake.hole} per hole won` : ""}${m.stake.type === "both" ? " · " : ""}${m.stake.type !== "hole" ? `$${m.stake.match} to the match winner${m.done ? "" : " (paid at the end)"}` : ""}</div></div>
        <div class="sect"><h2 class="h2">Ledger</h2><span class="muted sm">${r.ledger.length} entries</span></div>
        <div class="list">${r.ledger.length ? r.ledger.slice().reverse().map(l => `<div class="li"><div class="li-ic" style="background:${pl(l.to).color};color:${pl(l.to).ink}">${l.hole === "match" ? ic("trophy") : l.hole.slice(1)}</div><div class="li-main"><b>${esc(pl(l.to).name)} ${l.hole === "match" ? "wins the match" : "won #" + l.hole.slice(1)}</b><span>from ${esc(pl(l.from).name)}</span></div><span class="li-amt">+$${l.amt}</span></div>`).join("") : `<div class="li"><div class="li-main"><span>Nothing yet. Win a hole.</span></div></div>`}</div>`}
      <p class="fineprint">No real money moves in this prototype. Paying out inside the app needs a licensed payments / skill-gaming partner and legal review by state.</p>
    </div>`;
    view.querySelectorAll("[data-st]").forEach(x => x.onclick = () => { m.stake = { type: x.dataset.st, hole: 5, match: 20 }; save(); renderStakes(); });
  }

  // ---------- RESULT ----------
  function renderResult() {
    const m = M();
    if (!m) { location.hash = "#home"; return; }
    if (!m.done) { finishMatch(); return; }
    const r = resolve(m), b = mBoard(m), w = r.leader, st = settle(r.net), me = myPid(m);
    const iWon = w && w.id === me;
    const toMe = st.filter(s => s.to === me), fromMe = st.filter(s => s.from === me);
    const sum = a => a.reduce((x, s) => x + s.amt, 0), names = a => a.map(s => pl(s.from === me ? s.to : s.from).name).join(" & ");
    const owed = toMe.length ? `<div class="owed card"><b>${money(sum(toMe))}</b><span>${esc(names(toMe))} owe${toMe.length > 1 ? "" : "s"} you</span><em>Tracking only</em></div>`
      : fromMe.length ? `<div class="owed card down"><b>${money(sum(fromMe))}</b><span>You owe ${esc(names(fromMe))}</span><em>Tracking only</em></div>` : "";
    const title = iWon ? `You took<br><span>the course.</span>` : w ? `${esc(w.name)} took<br><span>the course.</span>` : `Dead even.<br><span>Nobody takes it.</span>`;
    view.innerHTML = `<div class="screen final" style="--pc:${w ? w.color : "#8a948a"}">
      <div class="res-hero"><img class="res-trophy" src="assets/trophy.webp" alt="" width="720" height="720"><div class="res-fade"></div>
        <div class="eyebrow sun">${esc(shortName(b.name))} · Final</div>
        <h1 class="res-title">${title}</h1>
        <p class="res-tally">${tally(m, r)}<span>holes</span></p></div>
      ${owed}
      <div class="board-card hex sm terrain">${hexBoard(m, { noCur: true })}</div>
      <div class="stats card">${r.table.map(t => `<div class="stat-r" style="--pc:${t.color}">${dot(t)}<b>${esc(t.name)}</b><span>${t.holes} holes</span><span>${t.strokes} (${rel(t.toPar)})</span><span>${t.steals} steal${t.steals === 1 ? "" : "s"}</span></div>`).join("")}</div>
      ${m.stake.type !== "none" ? `<div class="settle card"><div class="eyebrow">Settle up · tracking only</div>${st.length ? st.map(s => `<div class="owe"><span>${esc(pl(s.from).name)}</span>${ic("chev")}<span>${esc(pl(s.to).name)}</span><b>${money(s.amt)}</b></div>`).join("") : `<div class="muted">All square.</div>`}<div class="terms">Pay each other however you like. No money moves in the app.</div></div>` : ""}
      <div class="pad mt16 col"><button class="btn primary big block" id="rematch">${ic("redo")}Rematch</button><button class="btn ghost block" id="rdone">Done</button></div>
    </div>`;
    $("#rematch").onclick = () => { const d = { boardKey: m.boardKey, range: S.draft.range, players: m.players.map(p => ({ name: p.name })), mode: m.mode, stake: { ...m.stake } };
      if (synced(m) && m.net.role !== "host") { const mi = m.players.findIndex(p => p.id === me); if (mi > 0) { const x = d.players[0]; d.players[0] = d.players[mi]; d.players[mi] = x; } }
      newMatch(d); S.match.holes = m.holes.slice(); S.match.cur = S.match.holes[0]; save(); netBoot(); location.hash = synced() ? "#invite" : "#play"; };
    $("#rdone").onclick = () => { NET.stop(); S.match = null; save(); location.hash = "#home"; };
  }

  // ---------- CART DISPLAY (landscape course monitor) ----------
  function renderCart() {
    app.classList.add("cart");
    const m = M();
    if (!m || m.done) {
      view.innerHTML = `<div class="cartv idle"><div class="idle-bg" aria-hidden="true"></div><button class="cart-exit" id="cx">${ic("close")}Exit cart display</button>
        <div class="idle-body"><div class="eyebrow sun">Cart display</div><h1 class="res-title">Play your friends.<br><span>Take the course.</span></h1>
        <p class="muted">Start a match on this screen. Scores, yardage and territory stay up the whole round.</p>
        <a class="btn primary big" href="#new">${ic("plus")}New match</a></div></div>`;
      $("#cx").onclick = exitCart; return;
    }
    view.innerHTML = `<div class="cartv" id="cartv"></div>`;
    paintCart();
  }
  function paintCart() {
    const root = $("#cartv"); if (!root) return;
    const m = M(), b = mBoard(m), r = resolve(m), hid = m.cur, h = b.holes[hid], y = yardsFor(hid), g = geo(), gh = geoHole(g, hid);
    const own = r.owner[hid] && pl(r.owner[hid]);
    root.style.setProperty("--gc", own ? own.color : "rgba(190,255,220,.35)");
    root.innerHTML = `
      <section class="c-left">
        <div class="c-brand"><div class="brand-mark">${ic("flag", "#04130a")}</div><span>${esc(shortName(b.name))}</span></div>
        <div class="c-hole"><span>Hole</span><b>${h.ref}</b><em>Par ${h.par}${h.yards ? ` · ${h.yards} yds` : ""}</em></div>
        ${y ? `<div class="c-yards"><div class="c-y main"><span>${y.fromTee ? "To green · from tee" : "To green"}</span><b>${yd(y.center)}<small>yds</small></b></div>
          <div class="c-fb"><div class="c-y"><span>Front</span><b>${y.front == null ? "—" : yd(y.front)}</b></div><div class="c-y"><span>Back</span><b>${y.back == null ? "—" : yd(y.back)}</b></div></div></div>`
          : `<div class="c-yards none"><b>No GPS map for this hole</b><span>Scoring and territory still work.</span></div>`}
        <div class="c-gps">${g ? gpsChip() : ""}${g ? `<button class="gps-chip" id="csim">${ic("redo")}${GPS.G.mode === "sim" ? "Stop sim" : "Sim"}</button>` : ""}</div>
      </section>
      <section class="c-mid">${gh ? `<div class="c-map ${own ? "owned" : ""}" id="cmap"><div class="c-owner">${own ? `${dot(own)}${esc(own.name)}'s hole` : "Open hole"}</div><div class="osm-attr">© OpenStreetMap</div></div>` : `<div class="c-map hexonly terrain">${hexBoard(m)}</div>`}
        <div class="hole-strip c-strip">${holeStrip(m, r)}</div></section>
      <section class="c-right">
        <div class="c-top"><span class="live-tag"><i></i>Match · ${r.played.length}/${m.holes.length}</span>${synced(m) ? `<span data-net>${netChipHtml()}</span>` : ""}<button class="cart-exit" id="cx">${ic("close")}Exit</button></div>
        ${scoreboard(m, r, true)}
        ${gh ? `<div class="c-terr terrain">${hexBoard(m)}</div>` : ""}
        <div class="status">${holeStatus(m, r, hid)}</div>
        <div class="entries">${entryRows(m, hid, true)}</div>
        <button class="btn primary big block save" data-save>${(synced(m) ? (m.scores[hid] || {})[myPid(m)] != null : m.scores[hid]) ? "Update hole " + h.ref : "Save hole " + h.ref}</button>
      </section>`;
    if (gh) {
      const wrap = $("#cmap"), hm = holeSvg(g, gh, wrap.clientWidth || 480, wrap.clientHeight || 640, { bg: "#10241a" });
      wrap.insertAdjacentHTML("afterbegin", hm.svg);
      const svg = wrap.querySelector("svg");
      svg.addEventListener("click", e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); tapPt = hm.Ti([q.x, q.y]); paintCart(); });
    }
    bindEntry(root, m, hid); bindGps(root);
    const cs = $("#csim"); if (cs) cs.onclick = () => { if (GPS.G.mode === "sim") { GPS.stop(); return; } GPS.setAuto(true); GPS.D.holeId = m.cur; GPS.startSim(simPath(g, m.cur), { metersPerTick: 20, ms: 1000 }); };
    $("#cx").onclick = exitCart;
    const strip = root.querySelector(".c-strip"), cur = strip.querySelector(".cur"); if (cur) strip.scrollLeft = Math.max(0, cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2);
  }
  function exitCart() { app.classList.remove("cart"); location.hash = M() && !M().done ? "#play" : "#home"; }

  // ---------- RULES ----------
  function renderRules() {
    view.innerHTML = `<div class="screen">
      ${header("How it works", "30 seconds", `<a class="icon-btn" href="#home" aria-label="Close">${ic("close")}</a>`)}
      <p class="lede">A head-to-head match on a real course. The course is the board. Every hole is territory.</p>
      ${rulesCard()}
      <div class="ways mt16">
        <div class="way"><div class="way-ic">${ic("phone")}</div><b>Phone vs phone</b><span>Host shows a QR code, your friend scans it. Each phone enters its own score, synced live. Or pass one phone around.</span></div>
        <div class="way"><div class="way-ic sun">${ic("cart")}</div><b>On the cart</b><span>Cart display mode turns a course cart monitor into the scoreboard, yardage and map.</span></div></div>
      <div class="rules card mt16"><div class="eyebrow">Stakes</div><p class="muted" style="margin:6px 0 0">Set a per-hole and/or match stake. The app keeps a running ledger and tells you who owes who. Tracking only: no money moves in the app.</p></div>
      <div data-install class="home-install">${installHtml()}</div>
      <div class="pad mt16 col"><a class="btn primary block" href="#new">Start a match</a><button class="btn ghost block" id="reset">Reset all data</button></div>
    </div>`;
    paintInstall();
    $("#reset").onclick = () => { NET.stop(); localStorage.removeItem(KEY); const dev = S.dev; S = fresh(); S.dev = dev; S.onboarded = true; save(); toast("All match data cleared."); };
  }
  const emptyState = (t, p, href, cta) => `<div class="empty card"><div class="empty-ic">${ic("flag")}</div><b>${t}</b><p>${p}</p><a class="btn primary" href="${href}">${cta}</a></div>`;

  // ---------- router ----------
  function applyOutdoor() { app.classList.toggle("outdoor", !!S.outdoor); geo._k = null; }
  applyOutdoor();
  function repaint(full = true) { if (location.hash.startsWith("#cart")) paintCart(); else if (location.hash.startsWith("#play")) paintPlay(); }
  function route() {
    const parts = (location.hash.slice(1) || "home").split("/"), r = parts[0];
    overlayRoot.innerHTML = ""; sheetRoot.innerHTML = "";
    if (r !== "cart") app.classList.remove("cart");
    const tab = { new: "play", courses: "play", result: "map", invite: "play" }[r] || r;
    document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    tabbar.classList.toggle("hide", ["cart", "new", "courses", "join", "invite"].includes(r));
    view.scrollTop = 0;
    if (r === "join") return renderJoin(parts[1]);
    ({ home: renderHome, new: renderNew, courses: renderCourses, play: renderPlay, map: renderMap, stakes: renderStakes, result: renderResult, cart: renderCart, rules: renderRules, invite: renderInvite }[r] || renderHome)();
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", () => { if (location.hash.startsWith("#cart")) paintCart(); });

  // test / screenshot hooks
  window.FCdev = {
    state: () => S, resolve: () => M() && resolve(), net: () => NET.status(),
    loadQuick: i => loadQuick(QUICK[i || 0]),
    simAtHole: (ref, frac = 0.5) => { const g = geo(); const gh = g.holes.find(h => h.ref === ref); const L = OSM.lineLen(gh.pts); let d = L * frac, p = gh.pts[0];
      for (let i = 1; i < gh.pts.length; i++) { const s = OSM.dist2(gh.pts[i - 1], gh.pts[i]); if (d <= s) { const t = d / s; p = [gh.pts[i - 1][0] + (gh.pts[i][0] - gh.pts[i - 1][0]) * t, gh.pts[i - 1][1] + (gh.pts[i][1] - gh.pts[i - 1][1]) * t]; break; } d -= s; p = gh.pts[i]; }
      GPS.D.auto = true; GPS.D.holeId = null; const ll = g.pj.inv(p); GPS.simAt(ll[0], ll[1], 4); },
    quickScores: list => { const m = M(); list.forEach((vals, i) => { const hid = m.holes[i]; m.players.forEach((p, j) => setCell(m, hid, p.id, vals[j])); if (!m.log.includes(hid)) m.log.push(hid); }); ordLog(m); m.cur = nextMine(m) || m.cur; playEdit = null; save(); pushState(); route(); }
  };
  if (!S.dev) { S.dev = Math.random().toString(36).slice(2, 10); save(); }
  netBoot(); flushSignups();
  window.addEventListener("online", flushSignups);
  route();
})();
