-- Drop each column independently in reverse dependency/order sequence so the
-- rollback is safe after either a complete or partial forward migration.
SET @avatar_updated_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_updated_at'
);
SET @avatar_updated_at_sql = IF(
  @avatar_updated_at_exists = 1,
  'ALTER TABLE users DROP COLUMN avatar_updated_at',
  'SELECT 1'
);
PREPARE avatar_updated_at_statement FROM @avatar_updated_at_sql;
EXECUTE avatar_updated_at_statement;
DEALLOCATE PREPARE avatar_updated_at_statement;

SET @avatar_status_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_status'
);
SET @avatar_status_sql = IF(
  @avatar_status_exists = 1,
  'ALTER TABLE users DROP COLUMN avatar_status',
  'SELECT 1'
);
PREPARE avatar_status_statement FROM @avatar_status_sql;
EXECUTE avatar_status_statement;
DEALLOCATE PREPARE avatar_status_statement;

SET @avatar_key_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_key'
);
SET @avatar_key_sql = IF(
  @avatar_key_exists = 1,
  'ALTER TABLE users DROP COLUMN avatar_key',
  'SELECT 1'
);
PREPARE avatar_key_statement FROM @avatar_key_sql;
EXECUTE avatar_key_statement;
DEALLOCATE PREPARE avatar_key_statement;
