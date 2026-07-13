const bcrypt = require('bcryptjs');
const { stmts } = require('../db');

const DEPARTMENTS = [
  { key: 'front-desk', label: 'Front Desk' },
  { key: 'f-and-b', label: 'F&B' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'general', label: 'General' }
];

const DEPARTMENT_KEYS = new Set(DEPARTMENTS.map((d) => d.key));

function isValidDepartment(department) {
  return typeof department === 'string' && DEPARTMENT_KEYS.has(department);
}

function hashPasscode(passcode) {
  return bcrypt.hashSync(passcode, 12);
}

function setPasscode(department, passcode) {
  stmts.upsertPasscodeHash.run({
    department,
    passcode_hash: hashPasscode(passcode),
    updated_at: Date.now()
  });
}

function verifyPasscode(department, passcode) {
  if (!isValidDepartment(department) || typeof passcode !== 'string' || !passcode) return false;
  const row = stmts.getPasscodeHash.get(department);
  if (!row) return false;
  return bcrypt.compareSync(passcode, row.passcode_hash);
}

module.exports = { DEPARTMENTS, DEPARTMENT_KEYS, isValidDepartment, hashPasscode, setPasscode, verifyPasscode };
