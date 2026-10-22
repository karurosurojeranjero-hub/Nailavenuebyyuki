// Nail Avenue by Yuki — local web server (no framework needed).
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const http = require("http");
const os = require("os");

// ---- load .env (tiny parser, no dependency) --------------------------------
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { db, sha, rand, hashPassword, verifyPassword, syncAdmin, DATA_DIR } = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const SLOTS = ["10:00", "12:00", "15:00", "18:00", "21:00"];
const SLOT_LABEL = { "10:00": "10:00 AM", "12:00": "12:00 PM", "15:00": "3:00 PM", "18:00": "6:00 PM", "21:00": "9:00 PM" };
const DAYS_AHEAD = 60, CANCEL_HOURS = 24;
const STATUSES = ["Pending", "Confirmed", "Declined", "Cancelled"];
const ACTIVE = ["Pending", "Confirmed"];
const MIN = 60 * 1000, HOUR = 60 * MIN;

syncAdmin(process.env.ADMIN_USER, process.env.ADMIN_PASS);

// ---- helpers ---------------------------------------------------------------
const now = () => Date.now();
const todayPH = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const apptTime = (d, s) => new Date(`${d}T${s}:00+08:00`).getTime();
const pretty = d => new Date(`${d}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" });
const digits = s => String(s || "").replace(/\D/g, "");
const clean = (s, n = 200) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T12:00:00Z"));

function strongPassword(p) { return typeof p === "string" && p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p); }
function newId() { for (;;) { const id = "NAY-" + rand(4).slice(0, 6).toUpperCase(); if (!db.prepare("SELECT 1 FROM bookings WHERE id = ?").get(id)) return id; } }

const hits = new Map();
function limited(key, max, windowMs) {
  const t = now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(key, arr); return arr.length > max;
}

function view(r) {
  return { ...r, services: JSON.parse(r.services), photos: JSON.parse(r.photos), adminNote: r.admin_note };
}
function getBooking(id) { const r = db.prepare("SELECT * FROM bookings WHERE id = ?").get(String(id || "").toUpperCase()); return r ? view(r) : null; }
const isSlotErr = e => /UNIQUE/i.test(String(e && e.message));

// ---- admin sessions -----------------------------------------------------------
function createSession() {
  const token = rand(32);
  db.prepare("INSERT INTO sessions (token_hash, created, expires) VALUES (?,?,?)").run(sha(token), now(), now() + 12 * HOUR);
  return token;
}
function authed(token) {
  if (!token) return false;
  db.prepare("DELETE FROM sessions WHERE expires < ?").run(now());
  return !!db.prepare("SELECT 1 FROM sessions WHERE token_hash = ?").get(sha(token));
}
const admin = () => db.prepare("SELECT * FROM admin WHERE id = 1").get();

// ---- API: public --------------------------------------------------------------
const publicApi = {
  slots(q) {
    const date = q.date;
    if (!validDate(date)) return { ok: false, error: "bad_date" };
    const un = {};
    db.prepare("SELECT slot FROM bookings WHERE date = ? AND status IN ('Pending','Confirmed')").all(date).forEach(r => un[r.slot] = "booked");
    db.prepare("SELECT slot FROM blocked WHERE date = ?").all(date).forEach(r => {
      if (r.slot === "ALL") SLOTS.forEach(s => un[s] = un[s] || "blocked"); else un[r.slot] = un[r.slot] || "blocked";
    });
    return { ok: true, unavailable: un };
  },

  book(p) {
    const name = clean(p.name, 80), phone = clean(p.phone, 30), social = clean(p.social, 80);
    const clients = Math.round(Number(p.clients));
    if (name.length < 2 || digits(phone).length < 10 || digits(phone).length > 13 || social.length < 2)
      return { ok: false, error: "invalid", message: "Please check your name, contact number and social name." };
    if (!validDate(p.date) || p.date < todayPH() || p.date > new Date(now() + DAYS_AHEAD * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }))
      return { ok: false, error: "invalid", message: "Please choose a valid date." };
    if (!SLOTS.includes(p.slot) || apptTime(p.date, p.slot) <= now()) return { ok: false, error: "slot_taken" };
    if (!(clients >= 1 && clients <= 10) || !Array.isArray(p.services) || !p.services.length || p.agreed !== true)
      return { ok: false, error: "invalid", message: "Please complete the form and agree to the booking rules." };
    const services = p.services.slice(0, 20).map(s => ({ name: clean(s.name, 80), price: Math.max(0, Math.round(Number(s.price) || 0)) }));
    const total = services.reduce((a, s) => a + s.price, 0);
    const blocked = db.prepare("SELECT 1 FROM blocked WHERE date = ? AND slot IN (?, 'ALL')").get(p.date, p.slot);
    if (blocked) return { ok: false, error: "slot_taken" };

    const photos = [];
    for (const im of (Array.isArray(p.images) ? p.images : []).slice(0, 3)) {
      const buf = Buffer.from(String(im.data || ""), "base64");
      if (!buf.length || buf.length > 3 * 1024 * 1024 || !(buf[0] === 0xff && buf[1] === 0xd8)) continue; // JPEG only (client compresses to JPEG)
      const f = rand(12) + ".jpg"; fs.writeFileSync(path.join(DATA_DIR, "uploads", f), buf); photos.push("/uploads/" + f);
    }
    const id = newId(), ts = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    try {
      db.prepare(`INSERT INTO bookings (id,status,date,slot,name,phone,social,clients,services,total,design,drink,photos,submitted,updated)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, "Pending", p.date, p.slot, name, phone, social, clients, JSON.stringify(services), total,
        clean(p.design, 600), clean(p.drink, 60), JSON.stringify(photos), ts, ts);
    } catch (e) { if (isSlotErr(e)) return { ok: false, error: "slot_taken" }; throw e; }
    return { ok: true, id };
  },

  lookup(p) {
    const b = getBooking(p.id);
    if (!b || digits(b.phone).slice(-10) !== digits(p.phone).slice(-10)) return { ok: false, error: "not_found" };
    const hrs = (apptTime(b.date, b.slot) - now()) / HOUR;
    return { ok: true, booking: { id: b.id, status: b.status, date: b.date, slot: b.slot, name: b.name, services: b.services, total: b.total,
      drink: b.drink, clients: b.clients, adminNote: b.admin_note, hoursLeft: hrs, canCancel: ACTIVE.includes(b.status) && hrs >= CANCEL_HOURS } };
  },

  cancel(p) {
    const b = getBooking(p.id);
    if (!b || digits(b.phone).slice(-10) !== digits(p.phone).slice(-10)) return { ok: false, error: "not_found" };
    if (!ACTIVE.includes(b.status)) return { ok: false, error: "not_active" };
    if ((apptTime(b.date, b.slot) - now()) / HOUR < CANCEL_HOURS) return { ok: false, error: "too_late" };
    db.prepare("UPDATE bookings SET status='Cancelled', updated=? WHERE id=?").run(new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }), b.id);
    return { ok: true };
  }
};

// ---- API: admin login (username + password, signs straight in) ---------------------
const adminOpen = {
  adminLogin(p, ctx) {
    if (limited("login:" + ctx.ip, 15, 15 * MIN)) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
    const a = admin();
    if (a.locked_until > now()) return { ok: false, message: "Too many wrong passwords. Try again in a few minutes." };
    const okUser = String(p.user || "").trim().toLowerCase() === a.username.toLowerCase();
    const okPass = verifyPassword(String(p.pass || ""), a.pass_hash);
    if (!okUser || !okPass) {
      const failed = a.failed + 1;
      db.prepare("UPDATE admin SET failed = ?, locked_until = ? WHERE id = 1").run(failed >= 5 ? 0 : failed, failed >= 5 ? now() + 15 * MIN : 0);
      return { ok: false, message: failed >= 5 ? "Too many wrong attempts. Sign-in is paused for 15 minutes." : "Wrong username or password." };
    }
    db.prepare("UPDATE admin SET failed = 0, locked_until = 0 WHERE id = 1").run();
    return { ok: true, token: createSession() };
  }
};

// ---- API: admin (needs a session token) ----------------------------------------
function bookingFields(p, existing) {
  const f = {};
  const set = (k, v) => { f[k] = v; };
  const pick = (k, fallback) => (p[k] !== undefined ? p[k] : (existing ? existing[k] : fallback));
  const name = clean(pick("name", ""), 80), phone = clean(pick("phone", ""), 30);
  if (name.length < 2) return { error: "Please enter the client’s name." };
  if (digits(phone).length < 10) return { error: "Please enter a valid contact number." };
  const date = pick("date", ""), slot = pick("slot", "");
  if (!validDate(date)) return { error: "Please choose a date." };
  if (!SLOTS.includes(slot)) return { error: "Please choose a time slot." };
  const services = (Array.isArray(p.services) ? p.services : existing ? existing.services : []).slice(0, 20)
    .map(s => ({ name: clean(s.name, 80), price: Math.max(0, Math.round(Number(s.price) || 0)) })).filter(s => s.name);
  if (!services.length) return { error: "Add at least one service." };
  const status = pick("status", "Confirmed");
  if (!STATUSES.includes(status)) return { error: "Unknown status." };
  const total = p.total !== undefined && p.total !== "" ? Math.max(0, Math.round(Number(p.total) || 0)) : services.reduce((a, s) => a + s.price, 0);
  set("name", name); set("phone", phone); set("social", clean(pick("social", ""), 80)); set("date", date); set("slot", slot);
  set("clients", Math.min(10, Math.max(1, Math.round(Number(pick("clients", 1))) || 1))); set("services", JSON.stringify(services)); set("total", total);
  set("design", clean(pick("design", ""), 600)); set("drink", clean(pick("drink", ""), 60)); set("status", status);
  return { f };
}

const adminSecure = {
  adminLogout(p) { db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(p.token)); return { ok: true }; },

  adminList() {
    const bookings = db.prepare("SELECT * FROM bookings ORDER BY date, slot").all().map(view);
    const blocked = db.prepare("SELECT * FROM blocked ORDER BY date, slot").all();
    const count = {};
    bookings.filter(b => ACTIVE.includes(b.status)).forEach(b => { const k = b.date + b.slot; count[k] = (count[k] || 0) + 1; });
    bookings.forEach(b => {
      b.conflict = ACTIVE.includes(b.status) && (count[b.date + b.slot] > 1 || blocked.some(x => x.date === b.date && (x.slot === b.slot || x.slot === "ALL")));
    });
    return { ok: true, bookings, blocked };
  },

  adminSetStatus(p) {
    const b = getBooking(p.id);
    if (!b) return { ok: false, message: "Booking not found." };
    if (!STATUSES.includes(p.status)) return { ok: false, message: "Unknown status." };
    const comment = clean(p.comment, 500);
    try {
      db.prepare("UPDATE bookings SET status=?, admin_note=?, updated=? WHERE id=?")
        .run(p.status, comment || b.admin_note, new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }), b.id);
    } catch (e) { if (isSlotErr(e)) return { ok: false, message: "That time slot already has another active booking." }; throw e; }
    return { ok: true };
  },

  // Create (no id) or edit (id) an appointment.
  adminSave(p) {
    const existing = p.id ? getBooking(p.id) : null;
    if (p.id && !existing) return { ok: false, message: "Booking not found." };
    const { f, error } = bookingFields(p, existing);
    if (error) return { ok: false, message: error };
    const comment = clean(p.comment, 500), ts = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    let id;
    try {
      if (existing) {
        id = existing.id;
        db.prepare(`UPDATE bookings SET status=?,date=?,slot=?,name=?,phone=?,social=?,clients=?,services=?,total=?,design=?,drink=?,admin_note=?,updated=? WHERE id=?`)
          .run(f.status, f.date, f.slot, f.name, f.phone, f.social, f.clients, f.services, f.total, f.design, f.drink, comment || existing.admin_note, ts, id);
      } else {
        id = newId();
        db.prepare(`INSERT INTO bookings (id,status,date,slot,name,phone,social,clients,services,total,design,drink,photos,admin_note,submitted,updated)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,'[]',?,?,?)`).run(id, f.status, f.date, f.slot, f.name, f.phone, f.social, f.clients, f.services, f.total, f.design, f.drink, comment, ts, ts);
      }
    } catch (e) { if (isSlotErr(e)) return { ok: false, error: "slot_taken", message: "That date and time already has another active booking." }; throw e; }
    return { ok: true, id };
  },

  adminDelete(p) {
    const b = getBooking(p.id);
    if (!b) return { ok: false, message: "Booking not found." };
    db.prepare("DELETE FROM bookings WHERE id = ?").run(b.id);
    return { ok: true };
  },

  adminBlock(p) {
    if (!validDate(p.date) || !(p.slot === "ALL" || SLOTS.includes(p.slot))) return { ok: false, message: "Invalid date or slot." };
    db.prepare("INSERT OR REPLACE INTO blocked (date,slot,reason) VALUES (?,?,?)").run(p.date, p.slot, clean(p.reason, 100));
    const existing = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE date=? AND status IN ('Pending','Confirmed') ${p.slot === "ALL" ? "" : "AND slot=?"}`).get(...(p.slot === "ALL" ? [p.date] : [p.date, p.slot])).n;
    return { ok: true, existing };
  },
  adminUnblock(p) { db.prepare("DELETE FROM blocked WHERE date=? AND slot=?").run(String(p.date), String(p.slot)); return { ok: true }; }
};

// ---- HTTP plumbing -------------------------------------------------------------
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".gif": "image/gif" };
const PUBLIC = path.join(__dirname, "public");

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
const gz = new Map();
function serveStatic(req, res, pathname) {
  let root = PUBLIC, rel = pathname;
  if (pathname.startsWith("/uploads/")) { root = path.join(DATA_DIR, "uploads"); rel = pathname.slice(8); }
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(root, decodeURIComponent(rel)));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": /\.(html|js|css|webmanifest)$/.test(file) || /sw\.js$/.test(file) ? "no-cache" : "public, max-age=604800" };
    if (/\.(html|js|css|svg|webmanifest|json)$/.test(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && buf.length > 800) {
      const key = file + ":" + buf.length; let z = gz.get(key); if (!z) { z = zlib.gzipSync(buf, { level: 9 }); gz.set(key, z); }
      headers["Content-Encoding"] = "gzip"; headers["Vary"] = "Accept-Encoding"; res.writeHead(200, headers); return res.end(req.method === "HEAD" ? undefined : z);
    }
    res.writeHead(200, headers); res.end(req.method === "HEAD" ? undefined : buf);
  });
}
function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
const sendJson = (res, obj, code = 200) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

function handleAction(body, ctx) {
  const action = String(body.action || "");
  if (publicApi[action]) return publicApi[action](body, ctx);
  if (adminOpen[action]) return adminOpen[action](body, ctx);
  if (adminSecure[action]) {
    if (!authed(body.token)) return { ok: false, error: "auth", message: "Please sign in again." };
    return adminSecure[action](body, ctx);
  }
  return { ok: false, error: "unknown_action" };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (String(req.headers["x-forwarded-proto"] || "") === "https") res.setHeader("Strict-Transport-Security", "max-age=31536000");
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  const ctx = { ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), ua: String(req.headers["user-agent"] || "") };
  try {
    if (url.pathname === "/api") {
      if (req.method === "GET") return sendJson(res, handleAction(Object.fromEntries(url.searchParams), ctx));
      if (req.method === "POST") {
        let body; try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, { ok: false, error: "bad_request" }, 400); }
        return sendJson(res, handleAction(body, ctx));
      }
    }
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, url.pathname);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, { ok: false, error: "server", message: "Something went wrong on the server." }, 500);
  }
});

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === "IPv4" && !i.internal);
  console.log(`\n💅 Nail Avenue by Yuki is running`);
  console.log(`   On this computer : http://localhost:${PORT}`);
  if (lan) console.log(`   Same Wi-Fi / LAN : http://${lan.address}:${PORT}`);
  console.log(`   Admin login      : ${process.env.ADMIN_USER} (set in .env)\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.close(); try { db.close(); } catch {} process.exit(0); });
process.on("unhandledRejection", e => console.error("Unhandled:", e));
