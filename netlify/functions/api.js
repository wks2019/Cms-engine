const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getStore } = require('@netlify/blobs');

/*
 * Serverless variant of server/ (Express + SQLite) for trying the shared
 * library instantly on Netlify, using Netlify Blobs for storage. Same API
 * shape as server/routes/*, but no rate limiting — for real multi-site
 * production use, prefer the standalone server/ (see server/README.md).
 */

const DEPARTMENTS = [
  { key: 'front-desk', label: 'Front Desk' },
  { key: 'f-and-b', label: 'F&B' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'general', label: 'General' }
];
const DEPARTMENT_KEYS = new Set(DEPARTMENTS.map((d) => d.key));
const MAX_NAME_LENGTH = 200;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Secret'
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }, body: JSON.stringify(body) };
}
function noContent() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}
function isValidDepartment(department) {
  return typeof department === 'string' && DEPARTMENT_KEYS.has(department);
}
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function entriesStore() { return getStore('cms-entries'); }
function passcodeStore() { return getStore('cms-passcodes'); }

async function verifyPasscode(department, passcode) {
  if (!isValidDepartment(department) || typeof passcode !== 'string' || !passcode) return false;
  const record = await passcodeStore().get(department, { type: 'json' });
  if (!record) return false;
  return bcrypt.compareSync(passcode, record.passcode_hash);
}

function toMetadata(entry) {
  return {
    id: entry.id,
    name: entry.name,
    department: entry.department,
    created_by: entry.created_by || '',
    created_at: entry.created_at,
    updated_at: entry.updated_at
  };
}

async function listEntries({ department, q }) {
  const store = entriesStore();
  const { blobs } = await store.list();
  const entries = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  return entries
    .filter(Boolean)
    .filter((e) => !department || e.department === department)
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updated_at - a.updated_at);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  const path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'invalid_json' }); }
  }

  try {
    // GET /health
    if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
      return json(200, { ok: true, version: '1.0.0', backend: 'netlify-blobs' });
    }

    // GET /departments
    if (method === 'GET' && segments.length === 1 && segments[0] === 'departments') {
      return json(200, DEPARTMENTS);
    }

    // POST /auth/verify
    if (method === 'POST' && segments.length === 2 && segments[0] === 'auth' && segments[1] === 'verify') {
      return json(200, { valid: await verifyPasscode(body.department, body.passcode) });
    }

    // one-time admin seeding, protected by ADMIN_SECRET env var
    if (method === 'POST' && segments.length === 2 && segments[0] === 'admin' && segments[1] === 'seed-passcode') {
      const adminSecret = process.env.ADMIN_SECRET;
      if (!adminSecret || event.headers['x-admin-secret'] !== adminSecret) return json(401, { error: 'unauthorized' });
      const { department, passcode } = body;
      if (!isValidDepartment(department) || typeof passcode !== 'string' || passcode.length < 4) {
        return json(400, { error: 'invalid_input' });
      }
      await passcodeStore().setJSON(department, { passcode_hash: bcrypt.hashSync(passcode, 10), updated_at: Date.now() });
      return json(200, { ok: true });
    }

    // GET /entries
    if (method === 'GET' && segments.length === 1 && segments[0] === 'entries') {
      const entries = await listEntries({ department: qs.department, q: qs.q });
      return json(200, entries.map(toMetadata));
    }

    // GET /entries/export
    if (method === 'GET' && segments.length === 2 && segments[0] === 'entries' && segments[1] === 'export') {
      const entries = await listEntries({ department: qs.department, q: qs.q });
      return json(200, entries);
    }

    // GET /entries/:id
    if (method === 'GET' && segments.length === 2 && segments[0] === 'entries') {
      const entry = await entriesStore().get(segments[1], { type: 'json' });
      if (!entry) return json(404, { error: 'not_found' });
      return json(200, entry);
    }

    // POST /entries
    if (method === 'POST' && segments.length === 1 && segments[0] === 'entries') {
      const { name, department, created_by, passcode, snapshot } = body;
      if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH) return json(400, { error: 'invalid_name' });
      if (!isValidDepartment(department)) return json(400, { error: 'invalid_department' });
      if (!isPlainObject(snapshot)) return json(400, { error: 'invalid_snapshot' });
      if (!(await verifyPasscode(department, passcode))) return json(401, { error: 'invalid_passcode' });

      const now = Date.now();
      const entry = {
        id: crypto.randomUUID(),
        name: name.trim(),
        department,
        created_by: typeof created_by === 'string' ? created_by.trim().slice(0, 100) : '',
        created_at: now,
        updated_at: now,
        snapshot
      };
      await entriesStore().setJSON(entry.id, entry);
      return json(201, entry);
    }

    // PUT /entries/:id
    if (method === 'PUT' && segments.length === 2 && segments[0] === 'entries') {
      const id = segments[1];
      const existing = await entriesStore().get(id, { type: 'json' });
      if (!existing) return json(404, { error: 'not_found' });
      const { name, created_by, passcode, snapshot } = body;
      if (!(await verifyPasscode(existing.department, passcode))) return json(401, { error: 'invalid_passcode' });
      if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH)) return json(400, { error: 'invalid_name' });
      if (snapshot !== undefined && !isPlainObject(snapshot)) return json(400, { error: 'invalid_snapshot' });

      const updated = {
        ...existing,
        name: name !== undefined ? name.trim() : existing.name,
        created_by: created_by !== undefined ? String(created_by).trim().slice(0, 100) : existing.created_by,
        snapshot: snapshot !== undefined ? snapshot : existing.snapshot,
        updated_at: Date.now()
      };
      await entriesStore().setJSON(id, updated);
      return json(200, updated);
    }

    // DELETE /entries/:id
    if (method === 'DELETE' && segments.length === 2 && segments[0] === 'entries') {
      const id = segments[1];
      const existing = await entriesStore().get(id, { type: 'json' });
      if (!existing) return json(404, { error: 'not_found' });
      if (!(await verifyPasscode(existing.department, body.passcode))) return json(401, { error: 'invalid_passcode' });
      await entriesStore().delete(id);
      return noContent();
    }

    // POST /entries/import
    if (method === 'POST' && segments.length === 2 && segments[0] === 'entries' && segments[1] === 'import') {
      const { department, passcode, entries } = body;
      if (!isValidDepartment(department)) return json(400, { error: 'invalid_department' });
      if (!(await verifyPasscode(department, passcode))) return json(401, { error: 'invalid_passcode' });
      if (!Array.isArray(entries)) return json(400, { error: 'invalid_entries' });

      const store = entriesStore();
      let inserted = 0, skipped = 0;
      const errors = [];
      const now = Date.now();
      for (const en of entries) {
        if (!en || typeof en !== 'object') { skipped++; continue; }
        const candidateId = typeof en.id === 'string' && en.id ? en.id : crypto.randomUUID();
        if (await store.get(candidateId, { type: 'json' })) { skipped++; continue; }
        if (typeof en.name !== 'string' || !en.name.trim() || !isPlainObject(en.snapshot)) {
          errors.push({ id: candidateId, error: 'invalid_entry' });
          continue;
        }
        await store.setJSON(candidateId, {
          id: candidateId,
          name: en.name.trim().slice(0, MAX_NAME_LENGTH),
          department,
          created_by: typeof en.created_by === 'string' ? en.created_by.trim().slice(0, 100) : '',
          created_at: typeof en.savedAt === 'number' ? en.savedAt : now,
          updated_at: now,
          snapshot: en.snapshot
        });
        inserted++;
      }
      return json(200, { inserted, skipped, errors });
    }

    return json(404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'internal_error' });
  }
};
