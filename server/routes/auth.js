const express = require('express');
const { verifyPasscode } = require('../lib/passcodes');

const router = express.Router();

router.post('/verify', (req, res) => {
  const { department, passcode } = req.body || {};
  res.json({ valid: verifyPasscode(department, passcode) });
});

module.exports = router;
