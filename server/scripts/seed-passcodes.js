#!/usr/bin/env node
const { DEPARTMENTS, isValidDepartment, setPasscode } = require('../lib/passcodes');

const [, , department, passcode] = process.argv;

if (!department || !passcode) {
  console.error('Usage: node scripts/seed-passcodes.js <department> <passcode>');
  console.error('Departments: ' + DEPARTMENTS.map((d) => d.key).join(', '));
  process.exit(1);
}

if (!isValidDepartment(department)) {
  console.error(`Unknown department "${department}". Valid options: ${DEPARTMENTS.map((d) => d.key).join(', ')}`);
  process.exit(1);
}

if (passcode.length < 4) {
  console.error('Passcode must be at least 4 characters.');
  process.exit(1);
}

setPasscode(department, passcode);
console.log(`Passcode set for department "${department}".`);
