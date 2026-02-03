const express = require('express');
const router = express.Router();

// Placeholder investments route (stub to allow local server startup)
router.get('/', (req, res) => {
  res.json({ message: 'investments route placeholder' });
});

module.exports = router;
