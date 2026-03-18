import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";

// SQLite schema for Cloudflare D1
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  tokenBalance: integer("token_balance").notNull().default(0),
  dailyClaims: integer("daily_claims").notNull().default(0),
  lastClaimDate: integer("last_claim_date", { mode: 'timestamp' }),
});

export const newsArticles = sqliteTable("news_articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  publishedAt: integer("published_at", { mode: 'timestamp' }).notNull(),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  kind: text("kind").notNull(),
  sourceTitle: text("source_title").notNull(),
  sourceDomain: text("source_domain"),
  originalUrl: text("original_url").notNull(),
  url: text("url"),
  image: text("image"),
  instruments: text("instruments"), // JSON string instead of array
  votes: text("votes"),
  author: text("author"),
});

export const userClaims = sqliteTable("user_claims", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  userId: text("user_id").notNull().references(() => users.id),
  articleId: text("article_id").notNull(),
  tokensEarned: integer("tokens_earned").notNull(),
  claimedAt: integer("claimed_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const ipBindings = sqliteTable("ip_bindings", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  ipAddress: text("ip_address").notNull(),
  bindingType: text("binding_type").notNull(),
  walletAddress: text("wallet_address").notNull(),
  boundAt: integer("bound_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const predictions = sqliteTable("predictions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  walletAddress: text("wallet_address").notNull(),
  predictionId: text("prediction_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  betAmount: integer("bet_amount").notNull(),
  entryPrice: integer("entry_price").notNull(),
  exitPrice: integer("exit_price"),
  days: integer("days").notNull(),
  multiplier: integer("multiplier").notNull(),
  status: text("status").notNull().default("pending"),
  settlementDate: integer("settlement_date", { mode: 'timestamp' }).notNull(),
  payout: integer("payout"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const telegramPosts = sqliteTable("telegram_posts", {
  id: text("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  channel: text("channel").notNull(),
  category: text("category").notNull(),
  text: text("text").notNull(),
  date: integer("date", { mode: 'timestamp' }).notNull(),
  image: text("image"), // R2 URL
  imageData: text("image_data"), // Base64 data
  imageFileId: text("image_file_id"), // R2 object key
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Create unique indexes for SQLite
export const userClaimsUniqueIndex = sql`CREATE UNIQUE INDEX IF NOT EXISTS user_claims_user_article_unique ON user_claims(user_id, article_id)`;
export const ipBindingsUniqueIndex = sql`CREATE UNIQUE INDEX IF NOT EXISTS ip_bindings_unique ON ip_bindings(ip_address, binding_type)`;
export const telegramCategoryIndex = sql`CREATE INDEX IF NOT EXISTS idx_telegram_category ON telegram_posts(category)`;
export const telegramDateIndex = sql`CREATE INDEX IF NOT EXISTS idx_telegram_date ON telegram_posts(date DESC)`;

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertNewsArticleSchema = createInsertSchema(newsArticles).omit({
  createdAt: true,
});

export const insertUserClaimSchema = createInsertSchema(userClaims).omit({
  id: true,
  claimedAt: true,
});

export const insertIpBindingSchema = createInsertSchema(ipBindings).omit({
  id: true,
  boundAt: true,
});

export const insertPredictionSchema = createInsertSchema(predictions).omit({
  id: true,
  createdAt: true,
});

export const insertTelegramPostSchema = createInsertSchema(telegramPosts).omit({
  createdAt: true,
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type NewsArticle = typeof newsArticles.$inferSelect;
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;
export type UserClaim = typeof userClaims.$inferSelect;
export type InsertUserClaim = z.infer<typeof insertUserClaimSchema>;
export type IpBinding = typeof ipBindings.$inferSelect;
export type InsertIpBinding = z.infer<typeof insertIpBindingSchema>;
export type Prediction = typeof predictions.$inferSelect;
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type TelegramPost = typeof telegramPosts.$inferSelect;
export type InsertTelegramPost = z.infer<typeof insertTelegramPostSchema>;

// CryptoPanic response schema (unchanged)
export const cryptoPanicResponseSchema = z.object({
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(z.object({
    id: z.number(),
    slug: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    content: z.string().optional(),
    published_at: z.string(),
    created_at: z.string().optional(),
    kind: z.string(),
    source: z.object({
      title: z.string(),
      region: z.string().optional(),
      domain: z.string().optional(),
      type: z.string().optional(),
    }),
    original_url: z.string(),
    url: z.string().optional(),
    image: z.string().optional(),
    instruments: z.array(z.object({
      code: z.string(),
      title: z.string(),
      slug: z.string().optional(),
    })).optional(),
    votes: z.object({
      negative: z.number().optional(),
      positive: z.number().optional(),
      important: z.number().optional(),
      liked: z.number().optional(),
      disliked: z.number().optional(),
      lol: z.number().optional(),
      toxic: z.number().optional(),
      saved: z.number().optional(),
      comments: z.number().optional(),
    }).optional(),
    author: z.string().optional(),
  })),
});

export type CryptoPanicResponse = z.infer<typeof cryptoPanicResponseSchema>;