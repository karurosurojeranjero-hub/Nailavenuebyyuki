// Local SQL database (SQLite) using Node's built-in "node:sqlite" (Node 22.13+).
let DatabaseSync;
try { ({ DatabaseSync } = require("node:sqlite")); }
catch { console.error("\n❌ Your Node.js is too old (" + process.version + "). Install the LTS version from https://nodejs.org (22.13 or newer), then run again.\n"); process.exit(1); }
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "nailavenue.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'Pending',
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  social TEXT NOT NULL DEFAULT '',
  clients INTEGER NOT NULL DEFAULT 1,
  services TEXT NOT NULL DEFAULT '[]',
  total INTEGER NOT NULL DEFAULT 0,
  design TEXT NOT NULL DEFAULT '',
  drink TEXT NOT NULL DEFAULT '',
  photos TEXT NOT NULL DEFAULT '[]',
  admin_note TEXT NOT NULL DEFAULT '',
  submitted TEXT NOT NULL,
  updated TEXT NOT NULL
);
-- Guarantees two active bookings can never share a date + time slot.
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_slot ON bookings(date, slot) WHERE status IN ('Pending','Confirmed');
CREATE INDEX IF NOT EXISTS ix_bookings_date ON bookings(date);

CREATE TABLE IF NOT EXISTS blocked (
  date TEXT NOT NULL, slot TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, slot)
);
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL, pass_hash TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
  locked INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, created INTEGER NOT NULL, expires INTEGER NOT NULL
);
DROP TABLE IF EXISTS devices; DROP TABLE IF EXISTS login_requests; DROP TABLE IF EXISTS pw_changes; DROP TABLE IF EXISTS reset_codes;
`);

// ---- small crypto helpers -------------------------------------------------
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const rand = (n = 24) => crypto.randomBytes(n).toString("hex");
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split("$");
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- admin login always follows ADMIN_USER / ADMIN_PASS in .env ------------------------
function syncAdmin(user, pass) {
  if (!user || !pass) throw new Error("Set ADMIN_USER and ADMIN_PASS in the .env file.");
  const row = db.prepare("SELECT username, pass_hash FROM admin WHERE id = 1").get();
  if (!row) db.prepare("INSERT INTO admin (id, username, pass_hash) VALUES (1, ?, ?)").run(user, hashPassword(pass));
  else if (row.username !== user || !verifyPassword(pass, row.pass_hash)) {
    db.prepare("UPDATE admin SET username = ?, pass_hash = ?, failed = 0, locked_until = 0 WHERE id = 1").run(user, hashPassword(pass));
    db.exec("DELETE FROM sessions");
  }
}

module.exports = { db, sha, rand, hashPassword, verifyPassword, syncAdmin, DATA_DIR };
