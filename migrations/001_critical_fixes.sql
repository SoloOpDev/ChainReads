-- ============================================
-- COMPREHENSIVE DATABASE MIGRATION
-- Run this migration before production deploy
-- ============================================
-- This migration:
-- 1. Cleans up duplicate data
-- 2. Removes legacy unused fields
-- 3. Adds all performance indexes
-- 4. Adds all data integrity constraints
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: BACKUP EXISTING DATA (OPTIONAL)
-- ============================================
-- Uncomment if you want to backup before migration
-- CREATE TABLE user_points_backup AS SELECT * FROM user_points;
-- CREATE TABLE predictions_backup AS SELECT * FROM predictions;

-- ============================================
-- STEP 2: CLEAN UP DUPLICATE DATA
-- ============================================

-- Check for duplicates in user_points
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT user_id, article_id, COUNT(*) as cnt
        FROM user_points
        GROUP BY user_id, article_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate claims in user_points. Cleaning up...', duplicate_count;
        
        -- Keep only the first claim (earliest timestamp)
        DELETE FROM user_points
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM user_points
            GROUP BY user_id, article_id
        );
        
        RAISE NOTICE 'Cleanup complete. Removed duplicate claims.';
    ELSE
        RAISE NOTICE 'No duplicate claims found. Proceeding with migration.';
    END IF;
END $$;

-- ============================================
-- STEP 3: REMOVE LEGACY UNUSED FIELDS
-- ============================================

-- Remove daily_claims field from users table (legacy, unused)
ALTER TABLE users DROP COLUMN IF EXISTS daily_claims;

RAISE NOTICE 'Removed legacy fields.';

-- ============================================
-- STEP 4: ADD UNIQUE CONSTRAINTS
-- ============================================

-- CRITICAL: Prevent duplicate article claims in user_points
ALTER TABLE user_points 
ADD CONSTRAINT unique_user_points_article UNIQUE (user_id, article_id);

-- Also add to user_claims (legacy table, but keep it consistent)
ALTER TABLE user_claims 
ADD CONSTRAINT unique_user_claim_article UNIQUE (user_id, article_id);

RAISE NOTICE 'Added unique constraints to prevent duplicate claims.';

-- ============================================
-- STEP 5: ADD PERFORMANCE INDEXES
-- ============================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- News articles indexes
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_kind ON news_articles(kind);

-- User points indexes
CREATE INDEX IF NOT EXISTS idx_user_points_user ON user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_claimed ON user_points(claimed_at);

-- User claims indexes (legacy table)
CREATE INDEX IF NOT EXISTS idx_user_claims_user ON user_claims(user_id);

-- Predictions indexes
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_predictions_settlement ON predictions(settlement_date);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
-- Partial index for pending predictions only (most efficient)
CREATE INDEX IF NOT EXISTS idx_predictions_pending_settlement 
ON predictions(settlement_date) 
WHERE status = 'pending';

-- IP bindings indexes
CREATE INDEX IF NOT EXISTS idx_ip_bindings_ip ON ip_bindings(ip_address, binding_type);

-- Daily claims indexes
CREATE INDEX IF NOT EXISTS idx_daily_claims_date ON daily_claims(claim_date);

RAISE NOTICE 'Added all performance indexes.';

-- ============================================
-- STEP 6: ADD DATA INTEGRITY CONSTRAINTS
-- ============================================

-- Users: Ensure balance is never negative
ALTER TABLE users 
ADD CONSTRAINT check_balance_positive CHECK (token_balance >= 0);

-- User points: Ensure points are positive
ALTER TABLE user_points 
ADD CONSTRAINT check_points_positive CHECK (points_earned > 0);

-- Predictions: Ensure valid directions
ALTER TABLE predictions 
ADD CONSTRAINT check_direction CHECK (direction IN ('up', 'down'));

-- Predictions: Ensure valid status
ALTER TABLE predictions 
ADD CONSTRAINT check_status CHECK (status IN ('pending', 'won', 'lost'));

-- Predictions: Ensure valid days
ALTER TABLE predictions 
ADD CONSTRAINT check_days CHECK (days IN (3, 5, 7));

-- Predictions: Ensure valid multipliers
ALTER TABLE predictions 
ADD CONSTRAINT check_multiplier CHECK (multiplier IN (2, 3, 4));

-- Predictions: Ensure valid bet amounts (even numbers, 2-10000)
ALTER TABLE predictions 
ADD CONSTRAINT check_bet_amount CHECK (
    bet_amount >= 2 AND 
    bet_amount <= 10000 AND 
    bet_amount % 2 = 0
);

-- Predictions: Ensure valid symbols
ALTER TABLE predictions 
ADD CONSTRAINT check_symbol CHECK (symbol IN ('BTC', 'ETH'));

-- IP Bindings: Ensure valid binding types
ALTER TABLE ip_bindings 
ADD CONSTRAINT check_binding_type CHECK (binding_type IN ('claim', 'betting'));

-- Daily Claims: Ensure valid total points (max 300 = 3 sections * 100 points)
ALTER TABLE daily_claims 
ADD CONSTRAINT check_total_points CHECK (total_points >= 0 AND total_points <= 300);

RAISE NOTICE 'Added all data integrity constraints.';

COMMIT;

-- ============================================
-- STEP 7: VERIFICATION QUERIES
-- ============================================

-- Show all constraints
SELECT 
    conrelid::regclass AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
    'users'::regclass,
    'user_points'::regclass,
    'user_claims'::regclass,
    'predictions'::regclass,
    'ip_bindings'::regclass,
    'daily_claims'::regclass
)
ORDER BY conrelid, conname;

-- Show all indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN (
    'users',
    'user_points',
    'user_claims',
    'news_articles',
    'predictions',
    'ip_bindings',
    'daily_claims'
)
ORDER BY tablename, indexname;

-- Show table sizes (to verify indexes were created)
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN (
    'users',
    'user_points',
    'user_claims',
    'news_articles',
    'predictions',
    'ip_bindings',
    'daily_claims'
)
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Your database is now production-ready with:
-- ✅ No duplicate claims possible
-- ✅ All performance indexes in place
-- ✅ All data integrity constraints enforced
-- ✅ Legacy fields removed
-- ============================================
