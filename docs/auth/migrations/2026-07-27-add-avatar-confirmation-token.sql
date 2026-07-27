-- This nullable column is additive, so existing revisions that do not read it
-- remain compatible during a rolling deployment. The guard makes reruns safe.
SET @avatar_confirmation_token_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_confirmation_token'
);
SET @avatar_confirmation_token_sql = IF(
  @avatar_confirmation_token_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_confirmation_token CHAR(36) NULL AFTER avatar_updated_at',
  'SELECT 1'
);
PREPARE avatar_confirmation_token_statement FROM @avatar_confirmation_token_sql;
EXECUTE avatar_confirmation_token_statement;
DEALLOCATE PREPARE avatar_confirmation_token_statement;
