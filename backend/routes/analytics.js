const express = require('express');
const router = express.Router();

// Placeholder analytics route (stub)
router.get('/', (req, res) => {
  res.json({ message: 'analytics route placeholder' });
});

module.exports = router;
