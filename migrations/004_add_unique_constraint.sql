-- Add unique constraint to prevent duplicate claims
-- This prevents race conditions where two simultaneous requests could create duplicate claims

ALTER TABLE user_claims 
ADD CONSTRAINT user_claims_user_article_unique 
UNIQUE (user_id, article_id);

-- This will fail if there are existing duplicates
-- To handle existing duplicates, first run:
-- DELETE FROM user_claims a USING user_claims b 
-- WHERE a.id > b.id AND a.user_id = b.user_id AND a.article_id = b.article_id;
