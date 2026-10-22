CREATE TABLE "admin" (
	"id" integer PRIMARY KEY,
	"username" text NOT NULL,
	"pass_hash" text NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"locked_until" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked" (
	"date" text,
	"slot" text,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "blocked_pkey" PRIMARY KEY("date","slot")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY,
	"status" text DEFAULT 'Pending' NOT NULL,
	"date" text NOT NULL,
	"slot" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"social" text DEFAULT '' NOT NULL,
	"clients" integer DEFAULT 1 NOT NULL,
	"services" text DEFAULT '[]' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"design" text DEFAULT '' NOT NULL,
	"drink" text DEFAULT '' NOT NULL,
	"photos" text DEFAULT '[]' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"submitted" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY,
	"created" bigint NOT NULL,
	"expires" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_active_slot" ON "bookings" ("date","slot") WHERE status IN ('Pending','Confirmed');--> statement-breakpoint
CREATE INDEX "ix_bookings_date" ON "bookings" ("date");