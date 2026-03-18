-- Migration: Initial D1 Schema
-- Created: 2026-02-20

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  token_balance INTEGER NOT NULL DEFAULT 0,
  daily_claims INTEGER NOT NULL DEFAULT 0,
  last_claim_date INTEGER
);

CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_domain TEXT,
  original_url TEXT NOT NULL,
  url TEXT,
  image TEXT,
  instruments TEXT,
  votes TEXT,
  author TEXT
);

CREATE TABLE IF NOT EXISTS user_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  article_id TEXT NOT NULL,
  tokens_earned INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ip_bindings (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  bound_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  bet_amount INTEGER NOT NULL,
  entry_price INTEGER NOT NULL,
  exit_price INTEGER,
  days INTEGER NOT NULL,
  multiplier INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  settlement_date INTEGER NOT NULL,
  payout INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_posts (
  id TEXT PRIMARY KEY,
  message_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  date INTEGER NOT NULL,
  image TEXT,
  image_data TEXT,
  image_file_id TEXT,
  created_at INTEGER NOT NULL
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS user_claims_user_article_unique ON user_claims(user_id, article_id);
CREATE UNIQUE INDEX IF NOT EXISTS ip_bindings_unique ON ip_bindings(ip_address, binding_type);
CREATE INDEX IF NOT EXISTS idx_telegram_category ON telegram_posts(category);
CREATE INDEX IF NOT EXISTS idx_telegram_date ON telegram_posts(date DESC);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_wallet ON predictions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);