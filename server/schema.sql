CREATE TABLE IF NOT EXISTS library_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_department ON library_entries(department);
CREATE INDEX IF NOT EXISTS idx_library_updated_at ON library_entries(updated_at DESC);

CREATE TABLE IF NOT EXISTS department_passcodes (
  department TEXT PRIMARY KEY,
  passcode_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
