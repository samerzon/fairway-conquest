/* Fairway Conquest: OpenStreetMap course sync (free, public APIs).
   Data © OpenStreetMap contributors, available under the ODbL (https://www.openstreetmap.org/copyright).
   Nominatim: place/course search (max ~1 req/s, results cached, search only on submit).
   Overpass:  course lists + hole/green/tee/fairway/bunker/water geometry (cached in localStorage). */
(() => {
  const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const CK = "fc.cache.";               // localStorage cache prefix
  const M_PER_YD = 0.9144;
  let status = () => {};
  let cancelled = false, curCtl = null;
  function cancel() { cancelled = true; if (curCtl) curCtl.abort(); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- cache ----------
  function cacheGet(k, maxAgeDays = 30) {
    try { const v = JSON.parse(localStorage.getItem(CK + k)); if (v && Date.now() - v.t < maxAgeDays * 864e5) return v.d; } catch (e) {}
    return null;
  }
  function cacheSet(k, d) {
    try { localStorage.setItem(CK + k, JSON.stringify({ t: Date.now(), d })); }
    catch (e) { // storage full: drop oldest cache entries and retry once
      Object.keys(localStorage).filter(x => x.startsWith(CK)).slice(0, 5).forEach(x => localStorage.removeItem(x));
      try { localStorage.setItem(CK + k, JSON.stringify({ t: Date.now(), d })); } catch (e2) {}
    }
  }

  // ---------- network ----------
  let lastNom = 0;
  async function nominatim(q) {
    const key = "nom:" + q.toLowerCase().trim();
    const c = cacheGet(key, 14); if (c) return c;
    const wait = 1100 - (Date.now() - lastNom); if (wait > 0) await sleep(wait);   // usage policy: max 1 req/s
    lastNom = Date.now();
    const url = `${NOMINATIM}?format=jsonv2&limit=10&q=${encodeURIComponent(q)}`;
    // Browsers don't allow a custom User-Agent; the page's Referer identifies the app.
    const r = await fetch(url, { headers: { "Accept": "application/json" }, referrerPolicy: "strict-origin-when-cross-origin" });
    if (!r.ok) throw new Error("Place search failed (" + r.status + ")");
    const d = await r.json(); cacheSet(key, d); return d;
  }
  async function overpass(query, cacheKey, maxAgeDays = 30) {
    const c = cacheKey && cacheGet(cacheKey, maxAgeDays); if (c) return c;
    let lastErr; cancelled = false;
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < OVERPASS.length; i++) {
        if (cancelled) throw new Error("cancelled");
        const ep = OVERPASS[i], ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 35000); curCtl = ctl;
        status(round === 0 && i === 0 ? "Pulling map data from OpenStreetMap…" : `OpenStreetMap servers are busy. Trying another server (${round * OVERPASS.length + i + 1}/6)…`);
        try {
          // simple form POST = no CORS preflight
          const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl.signal });
          clearTimeout(to);
          if (r.ok) { const d = await r.json(); if (cacheKey) cacheSet(cacheKey, d); return d; }
          lastErr = new Error("Overpass " + r.status);
        } catch (e) { clearTimeout(to); lastErr = e; }
      }
      if (cancelled) throw new Error("cancelled");
      await sleep(3000);
    }
    throw lastErr || new Error("Overpass unavailable");
  }

  // ---------- geometry ----------
  const R_E = 6371008.8, rad = d => d * Math.PI / 180;
  function projector(lat0, lon0) {
    const kx = Math.cos(rad(lat0)) * R_E * Math.PI / 180, ky = R_E * Math.PI / 180;
    return { fwd: ([la, lo]) => [(lo - lon0) * kx, (la - lat0) * ky], inv: ([x, y]) => [lat0 + y / ky, lon0 + x / kx] };
  }
  function haversine(a, b) {
    const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
    return 2 * R_E * Math.asin(Math.sqrt(h));
  }
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function polyDist(p, pts) { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i])); return pts.length === 1 ? dist2(p, pts[0]) : m; }
  function centroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n], f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
    if (Math.abs(a) < 1e-9) return pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
    return [cx / (3 * a), cy / (3 * a)];
  }
  function inside(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
  const lineLen = pts => pts.reduce((s, p, i) => i ? s + dist2(p, pts[i - 1]) : 0, 0);

  /** Front / center / back of the green, measured along the line from the player to the green's center. */
  function greenYardages(P, green, fallbackCenter) {
    if (!green || green.length < 3) { const c = fallbackCenter; return c ? { center: dist2(P, c), front: null, back: null, c } : null; }
    const C = centroid(green), dx = C[0] - P[0], dy = C[1] - P[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const ts = [];
    for (let i = 0; i < green.length; i++) {
      const a = green[i], b = green[(i + 1) % green.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - P[0]) * ey - (a[1] - P[1]) * ex) / den, s = ((a[0] - P[0]) * uy - (a[1] - P[1]) * ux) / den;
      if (s >= 0 && s <= 1 && t >= 0) ts.push(t);
    }
    const inGreen = inside(P, green);
    return { center: L, front: inGreen ? 0 : ts.length ? Math.min(...ts) : null, back: ts.length ? Math.max(...ts) : null, c: C };
  }

  // ---------- parse a course ----------
  const ringOf = el => (el.geometry || []).map(g => [+g.lat.toFixed(6), +g.lon.toFixed(6)]);
  function parseCourse(json, meta) {
    const els = json.elements || [];
    const courseEl = els.find(e => e.tags && e.tags.leisure === "golf_course");
    const outline = [];
    if (courseEl) {
      if (courseEl.type === "way") outline.push(ringOf(courseEl));
      else (courseEl.members || []).filter(m => m.role !== "inner" && m.geometry).forEach(m => outline.push(m.geometry.map(g => [+g.lat.toFixed(6), +g.lon.toFixed(6)])));
    }
    const F = { greens: [], tees: [], fairways: [], bunkers: [], water: [] };
    const rawHoles = [];
    for (const e of els) {
      if (e === courseEl || !e.tags || !e.geometry) continue;
      const g = e.tags.golf, n = e.tags.natural, pts = ringOf(e);
      if (g === "hole") rawHoles.push({ id: e.id, tags: e.tags, line: pts });
      else if (g === "green") F.greens.push(pts);
      else if (g === "tee") F.tees.push(pts);
      else if (g === "fairway") F.fairways.push(pts);
      else if (g === "bunker" || n === "sand") F.bunkers.push(pts);
      else if (g === "water_hazard" || g === "lateral_water_hazard" || n === "water") F.water.push(pts);
    }
    const all = [...outline.flat(), ...rawHoles.flatMap(h => h.line)];
    const c0 = meta.center || (all.length ? [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length] : [0, 0]);
    const pj = projector(c0[0], c0[1]);
    const gC = F.greens.map(g => centroid(g.map(pj.fwd)));
    // orient each hole tee -> green, attach nearest green
    for (const h of rawHoles) {
      const L = h.line.map(pj.fwd), a = L[0], b = L[L.length - 1];
      const nearest = p => gC.reduce((m, c, i) => { const d = dist2(p, c); return d < m.d ? { d, i } : m; }, { d: Infinity, i: -1 });
      const na = nearest(a), nb = nearest(b);
      if (na.d < nb.d * 0.6) { h.line.reverse(); h.green = na.d < 60 ? na.i : -1; } else h.green = nb.d < 60 ? nb.i : -1;
      h.ref = parseInt(String(h.tags.ref || "").split(/[;,]/)[0], 10);
      h.par = parseInt(h.tags.par, 10) || null;
      h.len = lineLen(h.line.map(pj.fwd));
    }
    // group into loops (36-hole facilities often have duplicate refs and no course tag)
    const refd = rawHoles.filter(h => h.ref > 0 && h.ref <= 27);
    const byTag = {};
    refd.forEach(h => { const k = h.tags["golf:course:name"] || h.tags["golf:course"] || ""; (byTag[k] = byTag[k] || []).push(h); });
    let loops = [];
    for (const [tag, hs] of Object.entries(byTag)) {
      const groups = {}; hs.forEach(h => (groups[h.ref] = groups[h.ref] || []).push(h));
      const k = Math.max(...Object.values(groups).map(g => g.length));
      const sets = Array.from({ length: k }, () => []);
      const refs = Object.keys(groups).map(Number).sort((a, b) => a - b);
      for (const ref of refs) {
        const cand = groups[ref].slice();
        const order = sets.map((s, i) => i).sort((i, j) => (sets[j].length ? 1 : 0) - (sets[i].length ? 1 : 0));
        for (const si of order) {
          if (!cand.length) break;
          const prev = sets[si][sets[si].length - 1];
          let best = 0;
          if (prev) { const end = pj.fwd(prev.line[prev.line.length - 1]); best = cand.reduce((m, h, i) => dist2(pj.fwd(h.line[0]), end) < dist2(pj.fwd(cand[m].line[0]), end) ? i : m, 0); }
          sets[si].push(cand.splice(best, 1)[0]);
        }
      }
      sets.forEach((s, i) => { if (s.length) loops.push({ tag, idx: i, holes: s }); });
    }
    loops = loops.filter(l => l.holes.length >= 3).sort((a, b) => (b.holes.filter(h => h.par).length - a.holes.filter(h => h.par).length) || (b.holes.length - a.holes.length));
    loops.forEach((l, i) => {
      l.id = "L" + i;
      const parsKnown = l.holes.filter(h => h.par).length;
      l.name = l.tag || (loops.length > 1 ? `Loop ${String.fromCharCode(65 + i)}` : "Main course");
      l.parsKnown = parsKnown;
      l.holes = l.holes.sort((a, b) => a.ref - b.ref).map(h => ({ ref: h.ref, par: h.par, parSource: h.par ? "osm" : "guess", line: h.line, green: h.green, yards: Math.round(h.len / M_PER_YD) }));
      l.holes.forEach(h => { if (!h.par) h.par = h.yards < 250 ? 3 : h.yards > 470 ? 5 : 4; });   // guess from length, user can fix
    });
    return { key: meta.key, name: meta.name || (courseEl && courseEl.tags.name) || "Unnamed course", area: meta.area || "", center: c0, outline, features: F, loops,
      unrefHoles: rawHoles.length - refd.length, fetchedAt: Date.now(), source: meta.source || "overpass" };
  }

  async function loadCourse(osmType, osmId, meta = {}) {
    const key = `${osmType}/${osmId}`;
    const q = `[out:json][timeout:40];(${osmType}(${osmId});)->.c;.c out geom;.c map_to_area->.a;(way(area.a)["golf"~"^(hole|green|tee|fairway|bunker|water_hazard|lateral_water_hazard)$"];way(area.a)["natural"~"^(water|sand)$"];);out geom;`;
    let json, source = "overpass";
    try { json = await overpass(q, "course:" + key, 30); }
    catch (e) {
      // offline / busy fallback: bundled OSM snapshot for a couple of demo courses
      const r = await fetch(`data/${osmType}-${osmId}.json`).catch(() => null);
      if (r && r.ok) { json = await r.json(); source = "snapshot"; } else throw e;
    }
    return parseCourse(json, { ...meta, key, source });
  }

  /** Golf courses around a point (default 25 km), with a mapped-hole count for each. */
  async function coursesNear(lat, lon, radius = 25000) {
    const la = lat.toFixed(3), lo = lon.toFixed(3);
    const q = `[out:json][timeout:30];(way["leisure"="golf_course"](around:${radius},${la},${lo});relation["leisure"="golf_course"](around:${radius},${la},${lo}););out tags center bb;way["golf"="hole"](around:${radius + 1500},${la},${lo});out ids center;`;
    const d = await overpass(q, `near:${la},${lo},${radius}`, 7);
    return summarize(d.elements, [lat, lon]);
  }
  function summarize(els, origin) {
    const courses = els.filter(e => e.tags && e.tags.leisure === "golf_course" && e.tags.name);
    const holes = els.filter(e => e.type === "way" && e.center && !(e.tags && e.tags.leisure));   // hole centers (ids + center only, to keep the response small)
    return courses.map(c => {
      const b = c.bounds, ctr = c.center || (b && { lat: (b.minlat + b.maxlat) / 2, lon: (b.minlon + b.maxlon) / 2 });
      const n = b ? holes.filter(h => h.center.lat >= b.minlat && h.center.lat <= b.maxlat && h.center.lon >= b.minlon && h.center.lon <= b.maxlon).length : 0;
      const city = c.tags["addr:city"] || "";
      return { osmType: c.type, osmId: c.id, name: c.tags.name, area: city, lat: ctr.lat, lon: ctr.lon, holes: n, km: origin ? haversine(origin, [ctr.lat, ctr.lon]) / 1000 : null };
    }).sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  }

  /** Search by name or place. Golf course hits are returned directly; a town/area returns courses around it. */
  async function search(text) {
    const res = await nominatim(text);
    const golf = res.filter(r => r.category === "leisure" && r.type === "golf_course");
    if (golf.length) {
      // count mapped holes for the hits in one light Overpass query
      const ids = golf.map(g => `${g.osm_type}(${g.osm_id});`).join("");
      const q = `[out:json][timeout:30];(${ids})->.c;.c out tags center bb;foreach.c->.x(.x map_to_area->.a;way(area.a)["golf"="hole"];out ids center 1;way(area.a)["golf"="hole"];out count;);`;
      let counts = {};
      try {
        const d = await overpass(q, "cnt:" + golf.map(g => g.osm_id).join(","), 7);
        let cur = null;
        d.elements.forEach(e => { if (e.tags && e.tags.leisure) cur = e.type + "/" + e.id; else if (e.type === "count" && cur) counts[cur] = +e.tags.ways; });
      } catch (e) { counts = null; }
      return { kind: "courses", label: `Courses matching “${text}”`, list: golf.map(g => ({ osmType: g.osm_type, osmId: +g.osm_id, name: g.name || g.display_name.split(",")[0], area: g.display_name.split(",").slice(1, 3).join(",").trim(), lat: +g.lat, lon: +g.lon, holes: counts ? counts[g.osm_type + "/" + g.osm_id] ?? 0 : null })) };
    }
    if (!res.length) return { kind: "none", label: `Nothing found for “${text}”`, list: [] };
    const p = res[0];
    const list = await coursesNear(+p.lat, +p.lon, 25000);
    return { kind: "area", label: `Courses within 25 km of ${p.display_name.split(",")[0]}`, list };
  }

  window.OSM = { search, coursesNear, loadCourse, parseCourse, projector, haversine, polyDist, segDist, centroid, inside, greenYardages, lineLen, dist2,
    onStatus: fn => status = fn, cancel, cacheGet, cacheSet, M_PER_YD };
})();
