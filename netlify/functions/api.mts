// Nail Avenue by Yuki — booking + admin API (Netlify port of nail-avenue/server.js).
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { admin, blocked, bookings, sessions } from "../../db/schema.js";

type P = Record<string, any>;
type Ctx = { ip: string };

const SLOTS = ["10:00", "12:00", "15:00", "18:00", "21:00"];
const DAYS_AHEAD = 60, CANCEL_HOURS = 24;
const STATUSES = ["Pending", "Confirmed", "Declined", "Cancelled"];
const ACTIVE = ["Pending", "Confirmed"];
const MIN = 60 * 1000, HOUR = 60 * MIN;

// ---- helpers ---------------------------------------------------------------
const now = () => Date.now();
const todayPH = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const stamp = () => new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
const apptTime = (d: string, s: string) => new Date(`${d}T${s}:00+08:00`).getTime();
const digits = (s: unknown) => String(s || "").replace(/\D/g, "");
const clean = (s: unknown, n = 200) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const validDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(+new Date(d + "T12:00:00Z"));

const sha = (s: unknown) => crypto.createHash("sha256").update(String(s)).digest("hex");
const rand = (n = 24) => crypto.randomBytes(n).toString("hex");
function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
function verifyPassword(pw: string, stored: string) {
  const [, salt, hash] = String(stored).split("$");
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Postgres unique-violation (two active bookings in one slot), possibly wrapped by Drizzle.
function isSlotErr(e: any): boolean {
  for (let x = e; x; x = x.cause) if (x.code === "23505" || /unique|duplicate key/i.test(String(x.message))) return true;
  return false;
}

async function newId() {
  for (;;) {
    const id = "NAY-" + rand(4).slice(0, 6).toUpperCase();
    const [hit] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, id));
    if (!hit) return id;
  }
}

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const t = now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(key, arr); return arr.length > max;
}

type Row = typeof bookings.$inferSelect;
const view = (r: Row) => ({ ...r, admin_note: r.adminNote, services: JSON.parse(r.services), photos: JSON.parse(r.photos) });
async function getBooking(id: unknown) {
  const [r] = await db.select().from(bookings).where(eq(bookings.id, String(id || "").toUpperCase()));
  return r ? view(r) : null;
}

// ---- admin login always follows the ADMIN_USER / ADMIN_PASS environment variables ----
let synced: Promise<void> | null = null;
function syncAdmin() {
  return (synced ||= (async () => {
    const user = String(process.env.ADMIN_USER || "").trim(), pass = String(process.env.ADMIN_PASS || "");
    if (!user || !pass) throw new Error("Set ADMIN_USER and ADMIN_PASS environment variables.");
    const [row] = await db.select().from(admin).where(eq(admin.id, 1));
    if (!row) await db.insert(admin).values({ id: 1, username: user, passHash: hashPassword(pass) }).onConflictDoNothing();
    else if (row.username !== user || !verifyPassword(pass, row.passHash)) {
      await db.update(admin).set({ username: user, passHash: hashPassword(pass), failed: 0, lockedUntil: 0 }).where(eq(admin.id, 1));
      await db.delete(sessions);
    }
  })().catch(e => { synced = null; throw e; }));
}

// ---- admin sessions -----------------------------------------------------------
async function createSession() {
  const token = rand(32);
  await db.insert(sessions).values({ tokenHash: sha(token), created: now(), expires: now() + 12 * HOUR });
  return token;
}
async function authed(token: unknown) {
  if (!token) return false;
  await db.delete(sessions).where(lt(sessions.expires, now()));
  const [s] = await db.select({ t: sessions.tokenHash }).from(sessions).where(eq(sessions.tokenHash, sha(token)));
  return !!s;
}

// ---- API: public --------------------------------------------------------------
const publicApi: Record<string, (p: P, ctx: Ctx) => Promise<P>> = {
  async slots(q) {
    const date = q.date;
    if (!validDate(date)) return { ok: false, error: "bad_date" };
    const un: Record<string, string> = {};
    (await db.select({ slot: bookings.slot }).from(bookings).where(and(eq(bookings.date, date), inArray(bookings.status, ACTIVE))))
      .forEach(r => un[r.slot] = "booked");
    (await db.select({ slot: blocked.slot }).from(blocked).where(eq(blocked.date, date))).forEach(r => {
      if (r.slot === "ALL") SLOTS.forEach(s => un[s] = un[s] || "blocked"); else un[r.slot] = un[r.slot] || "blocked";
    });
    return { ok: true, unavailable: un };
  },

  async book(p) {
    const name = clean(p.name, 80), phone = clean(p.phone, 30), social = clean(p.social, 80);
    const clients = Math.round(Number(p.clients));
    if (name.length < 2 || digits(phone).length < 10 || digits(phone).length > 13 || social.length < 2)
      return { ok: false, error: "invalid", message: "Please check your name, contact number and social name." };
    if (!validDate(p.date) || p.date < todayPH() || p.date > new Date(now() + DAYS_AHEAD * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }))
      return { ok: false, error: "invalid", message: "Please choose a valid date." };
    if (!SLOTS.includes(p.slot) || apptTime(p.date, p.slot) <= now()) return { ok: false, error: "slot_taken" };
    if (!(clients >= 1 && clients <= 10) || !Array.isArray(p.services) || !p.services.length || p.agreed !== true)
      return { ok: false, error: "invalid", message: "Please complete the form and agree to the booking rules." };
    const services = p.services.slice(0, 20).map((s: P) => ({ name: clean(s.name, 80), price: Math.max(0, Math.round(Number(s.price) || 0)) }));
    const total = services.reduce((a: number, s: P) => a + s.price, 0);
    const [isBlocked] = await db.select({ d: blocked.date }).from(blocked)
      .where(and(eq(blocked.date, p.date), or(eq(blocked.slot, p.slot), eq(blocked.slot, "ALL"))));
    if (isBlocked) return { ok: false, error: "slot_taken" };

    const photos: string[] = [];
    const uploads = getStore("uploads");
    for (const im of (Array.isArray(p.images) ? p.images : []).slice(0, 3)) {
      const buf = Buffer.from(String(im.data || ""), "base64");
      if (!buf.length || buf.length > 3 * 1024 * 1024 || !(buf[0] === 0xff && buf[1] === 0xd8)) continue; // JPEG only (client compresses to JPEG)
      const f = rand(12) + ".jpg";
      await uploads.set(f, new Uint8Array(buf).buffer as ArrayBuffer);
      photos.push("/uploads/" + f);
    }
    const id = await newId(), ts = stamp();
    try {
      await db.insert(bookings).values({ id, status: "Pending", date: p.date, slot: p.slot, name, phone, social, clients,
        services: JSON.stringify(services), total, design: clean(p.design, 600), drink: clean(p.drink, 60),
        photos: JSON.stringify(photos), submitted: ts, updated: ts });
    } catch (e) { if (isSlotErr(e)) return { ok: false, error: "slot_taken" }; throw e; }
    return { ok: true, id };
  },

  async lookup(p) {
    const b = await getBooking(p.id);
    if (!b || digits(b.phone).slice(-10) !== digits(p.phone).slice(-10)) return { ok: false, error: "not_found" };
    const hrs = (apptTime(b.date, b.slot) - now()) / HOUR;
    return { ok: true, booking: { id: b.id, status: b.status, date: b.date, slot: b.slot, name: b.name, services: b.services, total: b.total,
      drink: b.drink, clients: b.clients, adminNote: b.adminNote, hoursLeft: hrs, canCancel: ACTIVE.includes(b.status) && hrs >= CANCEL_HOURS } };
  },

  async cancel(p) {
    const b = await getBooking(p.id);
    if (!b || digits(b.phone).slice(-10) !== digits(p.phone).slice(-10)) return { ok: false, error: "not_found" };
    if (!ACTIVE.includes(b.status)) return { ok: false, error: "not_active" };
    if ((apptTime(b.date, b.slot) - now()) / HOUR < CANCEL_HOURS) return { ok: false, error: "too_late" };
    await db.update(bookings).set({ status: "Cancelled", updated: stamp() }).where(eq(bookings.id, b.id));
    return { ok: true };
  }
};

// ---- API: admin login (username + password, signs straight in) ---------------------
const adminOpen: Record<string, (p: P, ctx: Ctx) => Promise<P>> = {
  async adminLogin(p, ctx) {
    if (limited("login:" + ctx.ip, 15, 15 * MIN)) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
    try { await syncAdmin(); }
    catch (e) { console.error(e); return { ok: false, message: "Admin login isn’t set up yet. Add ADMIN_USER and ADMIN_PASS in Netlify, then redeploy." }; }
    const [a] = await db.select().from(admin).where(eq(admin.id, 1));
    if (a.lockedUntil > now()) return { ok: false, message: "Too many wrong passwords. Try again in a few minutes." };
    const okUser = String(p.user || "").trim().toLowerCase() === a.username.toLowerCase();
    const okPass = verifyPassword(String(p.pass || ""), a.passHash);
    if (!okUser || !okPass) {
      const failed = a.failed + 1;
      await db.update(admin).set({ failed: failed >= 5 ? 0 : failed, lockedUntil: failed >= 5 ? now() + 15 * MIN : 0 }).where(eq(admin.id, 1));
      return { ok: false, message: failed >= 5 ? "Too many wrong attempts. Sign-in is paused for 15 minutes." : "Wrong username or password." };
    }
    await db.update(admin).set({ failed: 0, lockedUntil: 0 }).where(eq(admin.id, 1));
    return { ok: true, token: await createSession() };
  }
};

// ---- API: admin (needs a session token) ----------------------------------------
function bookingFields(p: P, existing: P | null) {
  const pick = (k: string, fallback: unknown) => (p[k] !== undefined ? p[k] : (existing ? existing[k] : fallback));
  const name = clean(pick("name", ""), 80), phone = clean(pick("phone", ""), 30);
  if (name.length < 2) return { error: "Please enter the client’s name." };
  if (digits(phone).length < 10) return { error: "Please enter a valid contact number." };
  const date = pick("date", ""), slot = pick("slot", "");
  if (!validDate(date)) return { error: "Please choose a date." };
  if (!SLOTS.includes(slot)) return { error: "Please choose a time slot." };
  const services = (Array.isArray(p.services) ? p.services : existing ? existing.services : []).slice(0, 20)
    .map((s: P) => ({ name: clean(s.name, 80), price: Math.max(0, Math.round(Number(s.price) || 0)) })).filter((s: P) => s.name);
  if (!services.length) return { error: "Add at least one service." };
  const status = pick("status", "Confirmed");
  if (!STATUSES.includes(status)) return { error: "Unknown status." };
  const total = p.total !== undefined && p.total !== "" ? Math.max(0, Math.round(Number(p.total) || 0)) : services.reduce((a: number, s: P) => a + s.price, 0);
  return { f: { name, phone, social: clean(pick("social", ""), 80), date, slot,
    clients: Math.min(10, Math.max(1, Math.round(Number(pick("clients", 1))) || 1)), services: JSON.stringify(services), total,
    design: clean(pick("design", ""), 600), drink: clean(pick("drink", ""), 60), status } };
}

const adminSecure: Record<string, (p: P, ctx: Ctx) => Promise<P>> = {
  async adminLogout(p) { await db.delete(sessions).where(eq(sessions.tokenHash, sha(p.token))); return { ok: true }; },

  async adminList() {
    const list: P[] = (await db.select().from(bookings).orderBy(asc(bookings.date), asc(bookings.slot))).map(view);
    const blk = await db.select().from(blocked).orderBy(asc(blocked.date), asc(blocked.slot));
    const count: Record<string, number> = {};
    list.filter(b => ACTIVE.includes(b.status)).forEach(b => { const k = b.date + b.slot; count[k] = (count[k] || 0) + 1; });
    list.forEach(b => {
      b.conflict = ACTIVE.includes(b.status) && (count[b.date + b.slot] > 1 || blk.some(x => x.date === b.date && (x.slot === b.slot || x.slot === "ALL")));
    });
    return { ok: true, bookings: list, blocked: blk };
  },

  async adminSetStatus(p) {
    const b = await getBooking(p.id);
    if (!b) return { ok: false, message: "Booking not found." };
    if (!STATUSES.includes(p.status)) return { ok: false, message: "Unknown status." };
    const comment = clean(p.comment, 500);
    try {
      await db.update(bookings).set({ status: p.status, adminNote: comment || b.adminNote, updated: stamp() }).where(eq(bookings.id, b.id));
    } catch (e) { if (isSlotErr(e)) return { ok: false, message: "That time slot already has another active booking." }; throw e; }
    return { ok: true };
  },

  // Create (no id) or edit (id) an appointment.
  async adminSave(p) {
    const existing = p.id ? await getBooking(p.id) : null;
    if (p.id && !existing) return { ok: false, message: "Booking not found." };
    const { f, error } = bookingFields(p, existing);
    if (!f) return { ok: false, message: error };
    const comment = clean(p.comment, 500), ts = stamp();
    let id: string;
    try {
      if (existing) {
        id = existing.id;
        await db.update(bookings).set({ ...f, adminNote: comment || existing.adminNote, updated: ts }).where(eq(bookings.id, id));
      } else {
        id = await newId();
        await db.insert(bookings).values({ id, ...f, photos: "[]", adminNote: comment, submitted: ts, updated: ts });
      }
    } catch (e) { if (isSlotErr(e)) return { ok: false, error: "slot_taken", message: "That date and time already has another active booking." }; throw e; }
    return { ok: true, id };
  },

  async adminDelete(p) {
    const b = await getBooking(p.id);
    if (!b) return { ok: false, message: "Booking not found." };
    await db.delete(bookings).where(eq(bookings.id, b.id));
    return { ok: true };
  },

  async adminBlock(p) {
    if (!validDate(p.date) || !(p.slot === "ALL" || SLOTS.includes(p.slot))) return { ok: false, message: "Invalid date or slot." };
    const reason = clean(p.reason, 100);
    await db.insert(blocked).values({ date: p.date, slot: p.slot, reason })
      .onConflictDoUpdate({ target: [blocked.date, blocked.slot], set: { reason } });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings)
      .where(and(eq(bookings.date, p.date), inArray(bookings.status, ACTIVE), p.slot === "ALL" ? undefined : eq(bookings.slot, p.slot)));
    return { ok: true, existing: n };
  },
  async adminUnblock(p) {
    await db.delete(blocked).where(and(eq(blocked.date, String(p.date)), eq(blocked.slot, String(p.slot))));
    return { ok: true };
  }
};

async function handleAction(body: P, ctx: Ctx) {
  const action = String(body.action || "");
  if (Object.hasOwn(publicApi, action)) return publicApi[action](body, ctx);
  if (Object.hasOwn(adminOpen, action)) return adminOpen[action](body, ctx);
  if (Object.hasOwn(adminSecure, action)) {
    if (!(await authed(body.token))) return { ok: false, error: "auth", message: "Please sign in again." };
    return adminSecure[action](body, ctx);
  }
  return { ok: false, error: "unknown_action" };
}

const sendJson = (obj: P, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default async (req: Request, context: Context) => {
  const ctx = { ip: context.ip || "" };
  try {
    if (req.method === "GET") return sendJson(await handleAction(Object.fromEntries(new URL(req.url).searchParams), ctx));
    if (req.method === "POST") {
      let body: P; try { body = JSON.parse(await req.text()); } catch { return sendJson({ ok: false, error: "bad_request" }, 400); }
      return sendJson(await handleAction(body, ctx));
    }
    return new Response("Method not allowed", { status: 405 });
  } catch (e) {
    console.error(e);
    return sendJson({ ok: false, error: "server", message: "Something went wrong on the server." }, 500);
  }
};

export const config: Config = { path: "/api" };
