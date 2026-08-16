CREATE TABLE IF NOT EXISTS drafts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  input_mode VARCHAR(16) NOT NULL,
  source_text MEDIUMTEXT NOT NULL,
  source_url VARCHAR(2048) NOT NULL,
  selected_platform VARCHAR(32) NOT NULL,
  tone VARCHAR(32) NOT NULL,
  custom_instruction TEXT NOT NULL,
  results_json MEDIUMTEXT NOT NULL,
  active_platform VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_drafts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  INDEX idx_drafts_user_updated_at (user_id, updated_at)
);
