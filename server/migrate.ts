import { db } from './db.js';
import { sql } from 'drizzle-orm';

/**
 * Auto-migrate database on startup
 * Creates all tables if they don't exist
 */
export async function runMigrations() {
  if (!db) {
    console.log('[MIGRATE] Skipping migrations - no database connection');
    return;
  }

  try {
    console.log('[MIGRATE] Running database migrations...');

    // Create tables if they don't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        token_balance INTEGER NOT NULL DEFAULT 0,
        daily_claims INTEGER NOT NULL DEFAULT 0,
        last_claim_date TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS news_articles (
        id VARCHAR PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        published_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        kind TEXT NOT NULL,
        source_title TEXT NOT NULL,
        source_domain TEXT,
        original_url TEXT NOT NULL,
        url TEXT,
        image TEXT,
        instruments TEXT[],
        votes TEXT,
        author TEXT
      );

      CREATE TABLE IF NOT EXISTS user_claims (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        article_id VARCHAR NOT NULL,
        tokens_earned INTEGER NOT NULL,
        claimed_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT user_claims_user_article_unique UNIQUE (user_id, article_id)
      );

      CREATE TABLE IF NOT EXISTS ip_bindings (
        ip_address VARCHAR(45) NOT NULL,
        binding_type VARCHAR(50) NOT NULL,
        wallet_address VARCHAR(42) NOT NULL,
        bound_at TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (ip_address, binding_type)
      );

      CREATE TABLE IF NOT EXISTS predictions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(42) NOT NULL,
        prediction_id VARCHAR(50) NOT NULL,
        symbol VARCHAR(10) NOT NULL,
        direction VARCHAR(10) NOT NULL,
        bet_amount INTEGER NOT NULL,
        entry_price INTEGER NOT NULL,
        exit_price INTEGER,
        days INTEGER NOT NULL,
        multiplier INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        settlement_date TIMESTAMP NOT NULL,
        payout INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS telegram_posts (
        id VARCHAR PRIMARY KEY,
        message_id INTEGER NOT NULL,
        channel VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        date TIMESTAMP NOT NULL,
        image TEXT,
        image_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_category ON telegram_posts(category);
      CREATE INDEX IF NOT EXISTS idx_telegram_date ON telegram_posts(date DESC);
    `);

    console.log('[MIGRATE] ✅ Database migrations completed successfully');

    // Auto-cleanup: Keep only last 7 days of history
    try {
      // Delete old claims (older than 7 days)
      await db.execute(sql`
        DELETE FROM user_claims 
        WHERE claimed_at < NOW() - INTERVAL '7 days'
      `);
      
      // Delete old predictions (older than 7 days)
      await db.execute(sql`
        DELETE FROM predictions 
        WHERE created_at < NOW() - INTERVAL '7 days'
      `);
      
      console.log('[MIGRATE] 🧹 Cleaned up history older than 7 days');
    } catch (cleanupError) {
      console.log('[MIGRATE] ⚠️ Cleanup skipped (tables might be empty)');
    }

  } catch (error) {
    console.error('[MIGRATE] ❌ Migration failed:', error);
    throw error;
  }
}
