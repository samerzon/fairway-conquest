/* Fairway Conquest live link: two (up to four) phones, peer to peer, no accounts.
   The host phone is the hub. Guests connect to it through the PeerJS broker, then data flows phone to phone over WebRTC.
   Every message is a full, small match snapshot; app.js merges them cell by cell, so a dropped message or a reload never loses a score. */
window.NET = (() => {
  const CFG = (window.FC_CONFIG && window.FC_CONFIG.PEER) || {};
  let peer = null, role = null, myId = null, hostId = null, conns = [], timer = null, hb = null, tries = 0;
  let st = { state: "off", detail: "", peers: 0 };
  const subs = { status: [], msg: [], open: [] };
  const emit = (k, ...a) => subs[k].forEach(f => { try { f(...a); } catch (e) { console.warn(e); } });
  function set(state, detail = "") { st = { state, detail, peers: conns.filter(c => c.open).length }; emit("status", st); }
  const opts = () => Object.assign({ debug: 0 }, CFG);
  const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const backoff = () => Math.min(15000, 1500 * Math.pow(1.6, tries++));

  function wire(c) {
    c._seen = Date.now();
    c.on("open", () => { tries = 0; if (!conns.includes(c)) conns.push(c); c._seen = Date.now(); set("live"); emit("open", c); });
    c.on("data", d => { c._seen = Date.now(); if (d && d.t === "ping") return; emit("msg", d, c); });
    const drop = () => { conns = conns.filter(x => x !== c); try { c.close(); } catch (e) {}
      if (role === "guest") { set("reconnecting", "Lost the host. Retrying…"); later(connectGuest, backoff()); }
      else set(conns.length ? "live" : "waiting"); };
    c.on("close", drop); c.on("error", drop); c._drop = drop;
  }
  function heartbeat() {
    clearInterval(hb);
    hb = setInterval(() => {
      conns.forEach(c => { if (!c.open) return; try { c.send({ t: "ping" }); } catch (e) {} if (Date.now() - c._seen > 16000) c._drop(); });
    }, 5000);
  }
  function mkPeer(id) {
    const P = window.FC_FAKE_PEER || window.Peer;      // FC_FAKE_PEER: test harness only, never set in the app
    if (typeof P === "undefined") { set("error", "Live link library didn't load."); return null; }
    const p = id ? new P(id, opts()) : new P(opts());
    p.on("disconnected", () => { if (p !== peer || p.destroyed) return; set(conns.length ? "live" : "reconnecting", "Broker dropped. Retrying…"); setTimeout(() => { if (p === peer && !p.destroyed) try { p.reconnect(); } catch (e) {} }, 1500); });
    p.on("error", e => {
      if (p !== peer) return;
      const t = e && e.type;
      if (t === "peer-unavailable") { set("reconnecting", "Host phone isn't online. Retrying…"); later(connectGuest, backoff()); return; }
      if (t === "unavailable-id") { set("reconnecting", "Re-claiming the match code…"); try { p.destroy(); } catch (x) {} peer = null; later(startHostPeer, 4000); return; }
      if (t === "browser-incompatible") { set("error", "This browser can't do live play."); return; }
      set("reconnecting", "Network hiccup. Retrying…");
      try { p.destroy(); } catch (x) {} peer = null;
      later(role === "host" ? startHostPeer : startGuestPeer, backoff());
    });
    return p;
  }
  function startHostPeer() {
    if (role !== "host") return;
    set("connecting", "Opening the match…");
    peer = mkPeer(hostId); if (!peer) return;
    peer.on("open", () => { tries = 0; set(conns.length ? "live" : "waiting", "Waiting for your rival"); });
    peer.on("connection", c => wire(c));
  }
  function startGuestPeer() {
    if (role !== "guest") return;
    set("connecting", "Finding the match…");
    peer = mkPeer(null); if (!peer) return;
    peer.on("open", () => connectGuest());
  }
  function connectGuest() {
    if (role !== "guest") return;
    if (!peer || peer.destroyed) return startGuestPeer();
    if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} later(connectGuest, 2000); return; }
    if (!peer.open) { later(connectGuest, 1500); return; }
    conns.forEach(c => { try { c.close(); } catch (e) {} }); conns = [];
    set(st.state === "off" || st.state === "connecting" ? "connecting" : "reconnecting", "Connecting to the host…");
    const c = peer.connect(hostId, { reliable: true });
    wire(c);
    later(() => { if (!c.open) { try { c.close(); } catch (e) {} set("reconnecting", "Host not answering. Retrying…"); later(connectGuest, backoff()); } }, 12000);
  }
  function stop() {
    clearTimeout(timer); clearInterval(hb); role = null;
    conns.forEach(c => { try { c.close(); } catch (e) {} }); conns = [];
    if (peer) try { peer.destroy(); } catch (e) {} peer = null; set("off");
  }
  // Coming back from the background on a phone: sockets are often dead, so nudge a reconnect.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible" || !role) return;
    if (role === "guest" && !conns.some(c => c.open)) { tries = 0; connectGuest(); }
    if (peer && peer.disconnected && !peer.destroyed) try { peer.reconnect(); } catch (e) {} });
  window.addEventListener("online", () => { if (role) { tries = 0; role === "guest" ? connectGuest() : (!peer || peer.destroyed) && startHostPeer(); } });

  return {
    host(id) { if (role === "host" && hostId === id && peer && !peer.destroyed) return; stop(); role = "host"; hostId = myId = id; tries = 0; heartbeat(); startHostPeer(); },
    join(id) { if (role === "guest" && hostId === id && peer && !peer.destroyed) return; stop(); role = "guest"; hostId = id; tries = 0; heartbeat(); startGuestPeer(); },
    send(msg, except) { conns.forEach(c => { if (c !== except && c.open) try { c.send(msg); } catch (e) {} }); },
    reply(c, msg) { if (c && c.open) try { c.send(msg); } catch (e) {} },
    stop, status: () => st, role: () => role, hostId: () => hostId,
    on(k, f) { subs[k].push(f); }
  };
})();
