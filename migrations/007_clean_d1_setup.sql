-- Clean D1 setup - SQLite compatible

-- Drop and recreate tables to ensure clean state
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS user_claims;
DROP TABLE IF EXISTS ip_bindings;
DROP TABLE IF EXISTS section_claims;
DROP TABLE IF EXISTS prediction_bets;
DROP TABLE IF EXISTS predictions;
DROP TABLE IF EXISTS exchanges;
DROP TABLE IF EXISTS telegram_posts;

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    tokenBalance INTEGER NOT NULL DEFAULT 0,
    dailyClaims INTEGER NOT NULL DEFAULT 0,
    lastClaimDate INTEGER
);

-- User claims table
CREATE TABLE user_claims (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    articleId TEXT NOT NULL,
    tokensEarned INTEGER NOT NULL,
    claimedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
);

-- IP bindings table
CREATE TABLE ip_bindings (
    id TEXT PRIMARY KEY,
    ipAddress TEXT NOT NULL,
    bindingType TEXT NOT NULL,
    walletAddress TEXT NOT NULL,
    createdAt TEXT NOT NULL
);

-- Section claims table
CREATE TABLE section_claims (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    section TEXT NOT NULL,
    points INTEGER NOT NULL,
    claimedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
);

-- Prediction bets table
CREATE TABLE prediction_bets (
    id TEXT PRIMARY KEY,
    predictionId TEXT NOT NULL,
    walletAddress TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount INTEGER NOT NULL,
    placedAt TEXT NOT NULL
);

-- Predictions table
CREATE TABLE predictions (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    createdAt TEXT NOT NULL
);

-- Exchanges table
CREATE TABLE exchanges (
    id TEXT PRIMARY KEY,
    walletAddress TEXT NOT NULL,
    points INTEGER NOT NULL,
    txHash TEXT NOT NULL,
    date INTEGER NOT NULL,
    confirmedAt TEXT NOT NULL
);

-- Telegram posts table
CREATE TABLE telegram_posts (
    id TEXT PRIMARY KEY,
    messageId INTEGER NOT NULL,
    channel TEXT NOT NULL,
    category TEXT NOT NULL,
    text TEXT NOT NULL,
    date INTEGER NOT NULL,
    image TEXT,
    imageData TEXT,
    imageFileId TEXT,
    createdAt INTEGER NOT NULL
);

-- Create indexes
CREATE UNIQUE INDEX idx_user_claims_unique ON user_claims(userId, articleId);
CREATE UNIQUE INDEX idx_ip_bindings_unique ON ip_bindings(ipAddress, bindingType);
CREATE INDEX idx_telegram_category ON telegram_posts(category);
CREATE INDEX idx_telegram_date ON telegram_posts(date DESC);
CREATE INDEX idx_users_username ON users(username);