import {
  bigint,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const transactionType = pgEnum("transaction_type", ["entrada", "saida"]);

export const oauthClients = pgTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" })
    .notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKey: text("owner_key").notNull(),
    type: transactionType("type").notNull(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("transactions_owner_key_occurred_on_idx").on(
      table.ownerKey,
      table.occurredOn,
    ),
  ],
);
