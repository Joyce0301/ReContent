-- Guard every column independently so this migration can be safely rerun after
-- either a complete run or an interrupted partial run.
SET @avatar_key_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_key'
);
SET @avatar_key_sql = IF(
  @avatar_key_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_key VARCHAR(512) NULL AFTER display_name',
  'SELECT 1'
);
PREPARE avatar_key_statement FROM @avatar_key_sql;
EXECUTE avatar_key_statement;
DEALLOCATE PREPARE avatar_key_statement;

-- Add in base-schema order. The preceding guard ensures avatar_key exists even
-- when a previous migration attempt stopped before creating it.
SET @avatar_status_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_status'
);
SET @avatar_status_sql = IF(
  @avatar_status_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_status VARCHAR(32) NOT NULL DEFAULT ''not_uploaded'' AFTER avatar_key',
  'SELECT 1'
);
PREPARE avatar_status_statement FROM @avatar_status_sql;
EXECUTE avatar_status_statement;
DEALLOCATE PREPARE avatar_status_statement;

SET @avatar_updated_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_updated_at'
);
SET @avatar_updated_at_sql = IF(
  @avatar_updated_at_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_updated_at DATETIME NULL AFTER avatar_status',
  'SELECT 1'
);
PREPARE avatar_updated_at_statement FROM @avatar_updated_at_sql;
EXECUTE avatar_updated_at_statement;
DEALLOCATE PREPARE avatar_updated_at_statement;
