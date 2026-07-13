const express = require('express');
const { DEPARTMENTS } = require('../lib/passcodes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(DEPARTMENTS);
});

module.exports = router;
