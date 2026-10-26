import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, index, primaryKey } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  participantCode: text("participant_code").notNull(),
  provider: text("provider"),
  appVersion: text("app_version"),
  consented: boolean("consented").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wishes = pgTable("wishes", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  text: text("text").notNull(),
  fromChip: boolean("from_chip").notNull().default(false),
  type: text("type"),
  focus: jsonb("focus").$type<string[]>(),
  domains: jsonb("domains").$type<string[]>(),
  guessedFocus: jsonb("guessed_focus").$type<string[]>(),
  guessedDomains: jsonb("guessed_domains").$type<string[]>(),
  archetype: text("archetype"),
  why: text("why"),
  priorAttempts: jsonb("prior_attempts").$type<{ chips: string[]; text?: string }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    clientTs: timestamp("client_ts", { withTimezone: true }),
    sessionId: uuid("session_id").notNull(),
    wishId: uuid("wish_id"),
    participantCode: text("participant_code").notNull(),
    appVersion: text("app_version").notNull(),
    provider: text("provider"),
    name: text("name").notNull(),
    step: integer("step"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("events_session_idx").on(t.sessionId), index("events_name_idx").on(t.name)],
);

export const generatedMoves = pgTable(
  "generated_moves",
  {
    id: text("id").notNull(),
    sessionId: uuid("session_id").notNull(),
    wishId: uuid("wish_id"),
    step: integer("step").notNull(),
    move: jsonb("move").$type<Record<string, unknown>>().notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.sessionId] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
