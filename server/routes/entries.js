const express = require('express');
const crypto = require('crypto');
const { stmts } = require('../db');
const { isValidDepartment, verifyPasscode } = require('../lib/passcodes');

const router = express.Router();

const MAX_NAME_LENGTH = 200;

function toMetadata(row) {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    created_by: row.created_by || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toFull(row) {
  let snapshot;
  try {
    snapshot = JSON.parse(row.snapshot);
  } catch {
    snapshot = null;
  }
  return { ...toMetadata(row), snapshot };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

router.get('/', (req, res) => {
  const department = typeof req.query.department === 'string' && req.query.department ? req.query.department : null;
  const q = typeof req.query.q === 'string' && req.query.q ? `%${req.query.q}%` : null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const rows = stmts.listEntries.all({ department, q, limit, offset });
  res.json(rows.map(toMetadata));
});

router.get('/export', (req, res) => {
  const department = typeof req.query.department === 'string' && req.query.department ? req.query.department : null;
  const q = typeof req.query.q === 'string' && req.query.q ? `%${req.query.q}%` : null;
  const rows = stmts.listEntriesFull.all({ department, q });
  res.json(rows.map(toFull));
});

router.get('/:id', (req, res) => {
  const row = stmts.getEntry.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(toFull(row));
});

router.post('/', (req, res) => {
  const { name, department, created_by, passcode, snapshot } = req.body || {};

  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (!isValidDepartment(department)) {
    return res.status(400).json({ error: 'invalid_department' });
  }
  if (!isPlainObject(snapshot)) {
    return res.status(400).json({ error: 'invalid_snapshot' });
  }
  if (!verifyPasscode(department, passcode)) {
    return res.status(401).json({ error: 'invalid_passcode' });
  }

  const now = Date.now();
  const row = {
    id: crypto.randomUUID(),
    name: name.trim(),
    department,
    created_by: typeof created_by === 'string' ? created_by.trim().slice(0, 100) : '',
    created_at: now,
    updated_at: now,
    snapshot: JSON.stringify(snapshot)
  };
  stmts.insertEntry.run(row);
  res.status(201).json(toFull(row));
});

router.put('/:id', (req, res) => {
  const existing = stmts.getEntry.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { name, created_by, passcode, snapshot } = req.body || {};

  if (!verifyPasscode(existing.department, passcode)) {
    return res.status(401).json({ error: 'invalid_passcode' });
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH)) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (snapshot !== undefined && !isPlainObject(snapshot)) {
    return res.status(400).json({ error: 'invalid_snapshot' });
  }

  const updated = {
    id: existing.id,
    name: name !== undefined ? name.trim() : existing.name,
    created_by: created_by !== undefined ? String(created_by).trim().slice(0, 100) : existing.created_by,
    snapshot: snapshot !== undefined ? JSON.stringify(snapshot) : existing.snapshot,
    updated_at: Date.now()
  };
  stmts.updateEntry.run(updated);
  res.json(toFull(stmts.getEntry.get(existing.id)));
});

router.delete('/:id', (req, res) => {
  const existing = stmts.getEntry.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { passcode } = req.body || {};
  if (!verifyPasscode(existing.department, passcode)) {
    return res.status(401).json({ error: 'invalid_passcode' });
  }

  stmts.deleteEntry.run(existing.id);
  res.status(204).end();
});

router.post('/import', (req, res) => {
  const { department, passcode, entries } = req.body || {};

  if (!isValidDepartment(department)) {
    return res.status(400).json({ error: 'invalid_department' });
  }
  if (!verifyPasscode(department, passcode)) {
    return res.status(401).json({ error: 'invalid_passcode' });
  }
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'invalid_entries' });
  }

  let inserted = 0;
  let skipped = 0;
  const errors = [];
  const now = Date.now();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') { skipped++; continue; }
    const { id, name, snapshot, created_by, savedAt } = entry;
    const candidateId = typeof id === 'string' && id ? id : crypto.randomUUID();

    if (stmts.getEntry.get(candidateId)) { skipped++; continue; }
    if (typeof name !== 'string' || !name.trim() || !isPlainObject(snapshot)) {
      errors.push({ id: candidateId, error: 'invalid_entry' });
      continue;
    }

    try {
      stmts.insertEntry.run({
        id: candidateId,
        name: name.trim().slice(0, MAX_NAME_LENGTH),
        department,
        created_by: typeof created_by === 'string' ? created_by.trim().slice(0, 100) : '',
        created_at: typeof savedAt === 'number' ? savedAt : now,
        updated_at: now,
        snapshot: JSON.stringify(snapshot)
      });
      inserted++;
    } catch (err) {
      errors.push({ id: candidateId, error: 'insert_failed' });
    }
  }

  res.json({ inserted, skipped, errors });
});

module.exports = router;
