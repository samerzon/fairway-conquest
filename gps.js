/* Fairway Conquest: GPS on-course mode.
   Live: navigator.geolocation.watchPosition (high accuracy). Sim: walks a fake position down the real hole lines. */
(() => {
  const listeners = new Set();
  const G = { mode: "off", fix: null, error: null, watchId: null, simTimer: null, sim: null };
  const emit = () => listeners.forEach(fn => fn(G));

  function startLive() {
    stop(true);
    if (!("geolocation" in navigator)) { G.error = "This browser has no GPS access."; emit(); return; }
    if (!window.isSecureContext) { G.error = "GPS needs an https:// link. Open the tunnel link, not a local file."; emit(); return; }
    G.mode = "live"; G.error = null; emit();
    G.watchId = navigator.geolocation.watchPosition(p => {
      G.fix = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp, sim: false }; G.error = null; emit();
    }, e => {
      G.error = e.code === 1 ? "Location is blocked. Allow it in your browser settings." : e.code === 3 ? "Still looking for GPS…" : "Can't get a GPS fix right now.";
      emit();
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }

  /** path: array of [lat,lon] waypoints (tee → green of each hole, in order). */
  function startSim(path, opts = {}) {
    stop(true);
    G.mode = "sim"; G.error = null;
    const step = opts.metersPerTick || 22, tick = opts.ms || 1000;
    // densify path by distance
    const pts = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], d = OSM.haversine(a, b), n = Math.max(1, Math.round(d / step));
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    pts.push(path[path.length - 1]);
    G.sim = { pts, i: opts.startIndex || 0 };
    const go = () => {
      const s = G.sim; if (!s) return;
      const p = s.pts[Math.min(s.i, s.pts.length - 1)];
      const j = () => (Math.random() - .5) * 0.00002;   // ~±1 m jitter
      G.fix = { lat: p[0] + j(), lon: p[1] + j(), acc: 3 + Math.round(Math.random() * 4), ts: Date.now(), sim: true };
      s.i = (s.i + 1) % s.pts.length; emit();
    };
    go(); G.simTimer = setInterval(go, tick);
    emit();
  }
  /** Freeze the simulated position at an exact point (used for screenshots / testing). */
  function simAt(lat, lon, acc = 4) { stop(true); G.mode = "sim"; G.fix = { lat, lon, acc, ts: Date.now(), sim: true }; emit(); }
  function stop(silent) {
    if (G.watchId != null) navigator.geolocation.clearWatch(G.watchId);
    clearInterval(G.simTimer); G.watchId = null; G.simTimer = null; G.sim = null; G.mode = "off";
    if (!silent) { G.fix = null; emit(); }
  }

  // ---------- current-hole detection with hysteresis ----------
  const D = { holeId: null, auto: true, cand: null, candN: 0, lastSwitch: 0 };
  /** holes: [{id, pts (local meters), tee:[x,y], green:[x,y]}], P: [x,y] local meters. Returns {holeId, changed, dist}. */
  function detect(holes, P) {
    if (!holes.length) return { holeId: D.holeId, changed: false };
    const scored = holes.map(h => {
      let d = OSM.polyDist(P, h.pts);
      if (h.tee) d = Math.min(d, OSM.dist2(P, h.tee) * 0.8);   // standing on a tee box is a strong signal
      return { id: h.id, d };
    }).sort((a, b) => a.d - b.d);
    const best = scored[0];
    if (best.d > 450) return { holeId: D.holeId, changed: false, offCourse: true, dist: best.d };
    if (!D.auto) return { holeId: D.holeId, changed: false, dist: best.d };
    if (!D.holeId) { D.holeId = best.id; return { holeId: best.id, changed: true, dist: best.d }; }
    if (best.id === D.holeId) { D.cand = null; D.candN = 0; return { holeId: D.holeId, changed: false, dist: best.d }; }
    const cur = scored.find(s => s.id === D.holeId);
    // hysteresis: the new hole has to be clearly closer (25 m) for 3 fixes in a row
    if (cur && cur.d - best.d > 25) {
      if (D.cand === best.id) D.candN++; else { D.cand = best.id; D.candN = 1; }
      if (D.candN >= 3) { D.holeId = best.id; D.cand = null; D.candN = 0; D.lastSwitch = Date.now(); return { holeId: best.id, changed: true, dist: best.d }; }
    } else { D.cand = null; D.candN = 0; }
    return { holeId: D.holeId, changed: false, dist: cur ? cur.d : best.d };
  }
  function setHole(id, manual = true) { D.holeId = id; if (manual) D.auto = false; D.cand = null; D.candN = 0; }
  function setAuto(on) { D.auto = on; D.cand = null; D.candN = 0; }

  window.GPS = { G, D, startLive, startSim, simAt, stop: () => stop(false), detect, setHole, setAuto, on: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
})();
