const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'library.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const stmts = {
  listEntries: db.prepare(`
    SELECT id, name, department, created_by, created_at, updated_at
    FROM library_entries
    WHERE (@department IS NULL OR department = @department)
      AND (@q IS NULL OR name LIKE @q COLLATE NOCASE)
    ORDER BY updated_at DESC
    LIMIT @limit OFFSET @offset
  `),
  listEntriesFull: db.prepare(`
    SELECT id, name, department, created_by, created_at, updated_at, snapshot
    FROM library_entries
    WHERE (@department IS NULL OR department = @department)
      AND (@q IS NULL OR name LIKE @q COLLATE NOCASE)
    ORDER BY updated_at DESC
  `),
  getEntry: db.prepare(`SELECT * FROM library_entries WHERE id = ?`),
  insertEntry: db.prepare(`
    INSERT INTO library_entries (id, name, department, created_by, created_at, updated_at, snapshot)
    VALUES (@id, @name, @department, @created_by, @created_at, @updated_at, @snapshot)
  `),
  updateEntry: db.prepare(`
    UPDATE library_entries
    SET name = @name, created_by = @created_by, snapshot = @snapshot, updated_at = @updated_at
    WHERE id = @id
  `),
  deleteEntry: db.prepare(`DELETE FROM library_entries WHERE id = ?`),
  getPasscodeHash: db.prepare(`SELECT passcode_hash FROM department_passcodes WHERE department = ?`),
  upsertPasscodeHash: db.prepare(`
    INSERT INTO department_passcodes (department, passcode_hash, updated_at)
    VALUES (@department, @passcode_hash, @updated_at)
    ON CONFLICT(department) DO UPDATE SET passcode_hash = excluded.passcode_hash, updated_at = excluded.updated_at
  `)
};

module.exports = { db, stmts, DB_PATH };
