const express = require('express');
const router = express.Router();
// Simple DB connectivity check endpoint (lazy require to avoid circular import)
router.get('/', async (req, res) => {
  try {
    const supabase = require('../lib/supabase');
    // Attempt to read a small slice from a commonly used table
    const { data, error } = await supabase.from('properties').select('id').limit(1);
    if (error) {
      return res.status(502).json({ ok: false, error: error.message || error });
    }
    return res.json({ ok: true, rows: (data || []).length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
