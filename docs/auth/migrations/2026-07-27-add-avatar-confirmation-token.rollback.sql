-- Do not run this rollback while any deployed application revision references
-- avatar_confirmation_token. The nullable column may remain indefinitely; drop
-- it only after those revisions are drained and the application rollback is stable.
SET @avatar_confirmation_token_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_confirmation_token'
);
SET @avatar_confirmation_token_sql = IF(
  @avatar_confirmation_token_exists = 1,
  'ALTER TABLE users DROP COLUMN avatar_confirmation_token',
  'SELECT 1'
);
PREPARE avatar_confirmation_token_statement FROM @avatar_confirmation_token_sql;
EXECUTE avatar_confirmation_token_statement;
DEALLOCATE PREPARE avatar_confirmation_token_statement;
