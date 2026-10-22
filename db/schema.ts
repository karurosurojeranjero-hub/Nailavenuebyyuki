import { pgTable, text, integer, bigint, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const bookings = pgTable("bookings", {
  id: text().primaryKey(),
  status: text().notNull().default("Pending"),
  date: text().notNull(),
  slot: text().notNull(),
  name: text().notNull(),
  phone: text().notNull(),
  email: text().notNull().default(""),
  social: text().notNull().default(""),
  clients: integer().notNull().default(1),
  services: text().notNull().default("[]"),
  total: integer().notNull().default(0),
  design: text().notNull().default(""),
  drink: text().notNull().default(""),
  photos: text().notNull().default("[]"),
  adminNote: text("admin_note").notNull().default(""),
  submitted: text().notNull(),
  updated: text().notNull(),
}, t => [
  // Guarantees two active bookings can never share a date + time slot.
  uniqueIndex("ux_active_slot").on(t.date, t.slot).where(sql`status IN ('Pending','Confirmed')`),
  index("ix_bookings_date").on(t.date),
]);

export const blocked = pgTable("blocked", {
  date: text().notNull(),
  slot: text().notNull(),
  reason: text().notNull().default(""),
}, t => [primaryKey({ columns: [t.date, t.slot] })]);

export const admin = pgTable("admin", {
  id: integer().primaryKey(),
  username: text().notNull(),
  passHash: text("pass_hash").notNull(),
  failed: integer().notNull().default(0),
  lockedUntil: bigint("locked_until", { mode: "number" }).notNull().default(0),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  created: bigint({ mode: "number" }).notNull(),
  expires: bigint({ mode: "number" }).notNull(),
});
