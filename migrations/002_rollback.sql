-- ============================================
-- ROLLBACK MIGRATION
-- Use this ONLY if you need to undo the migration
-- ============================================
-- WARNING: This will remove all constraints and indexes
-- added by the migration. Use with caution!
-- ============================================

BEGIN;

-- ============================================
-- REMOVE UNIQUE CONSTRAINTS
-- ============================================

ALTER TABLE user_points DROP CONSTRAINT IF EXISTS unique_user_points_article;
ALTER TABLE user_claims DROP CONSTRAINT IF EXISTS unique_user_claim_article;

-- ============================================
-- REMOVE CHECK CONSTRAINTS
-- ============================================

-- Users
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_balance_positive;

-- User points
ALTER TABLE user_points DROP CONSTRAINT IF EXISTS check_points_positive;

-- Predictions
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS check_direction;
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS check_days;
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS check_multiplier;
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS check_bet_amount;
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS check_symbol;

-- IP Bindings
ALTER TABLE ip_bindings DROP CONSTRAINT IF EXISTS check_binding_type;

-- Daily Claims
ALTER TABLE daily_claims DROP CONSTRAINT IF EXISTS check_total_points;

-- ============================================
-- REMOVE INDEXES
-- ============================================

-- Users
DROP INDEX IF EXISTS idx_users_username;

-- News articles
DROP INDEX IF EXISTS idx_news_published;
DROP INDEX IF EXISTS idx_news_kind;

-- User points
DROP INDEX IF EXISTS idx_user_points_user;
DROP INDEX IF EXISTS idx_user_points_claimed;

-- User claims
DROP INDEX IF EXISTS idx_user_claims_user;

-- Predictions
DROP INDEX IF EXISTS idx_predictions_status;
DROP INDEX IF EXISTS idx_predictions_settlement;
DROP INDEX IF EXISTS idx_predictions_user;
DROP INDEX IF EXISTS idx_predictions_pending_settlement;

-- IP bindings
DROP INDEX IF EXISTS idx_ip_bindings_ip;

-- Daily claims
DROP INDEX IF EXISTS idx_daily_claims_date;

-- ============================================
-- RESTORE LEGACY FIELDS (OPTIONAL)
-- ============================================

-- Uncomment if you want to restore the daily_claims field
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_claims INTEGER NOT NULL DEFAULT 0;

COMMIT;

-- ============================================
-- ROLLBACK COMPLETE
-- ============================================
-- All migration changes have been reverted.
-- Your database is back to its pre-migration state.
-- ============================================
