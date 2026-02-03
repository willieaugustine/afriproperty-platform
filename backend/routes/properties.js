const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth');

// Get all properties
router.get('/', async (req, res) => {
  try {
    const { 
      country, 
      status = 'active', 
      limit = 20, 
      offset = 0,
      min_price,
      max_price
    } = req.query;

    let query = supabase
      .from('properties')
      .select(`
        *,
        owner:profiles!owner_id(id, full_name)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (country) query = query.eq('country', country);
    if (status) query = query.eq('status', status);
    if (min_price) query = query.gte('total_value', min_price);
    if (max_price) query = query.lte('total_value', max_price);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      properties: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get property by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        owner:profiles!owner_id(id, full_name, country),
        property_amenities(*),
        property_valuations(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Get investment stats
    const { data: stats } = await supabase
      .rpc('get_property_stats', { property_id: id });

    res.json({
      property: data,
      stats
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create property (Operator/Admin only)
router.post('/', authenticateUser, requireRole(['operator', 'admin']), async (req, res) => {
  try {
    const propertyData = {
      ...req.body,
      owner_id: req.user.id,
      status: 'pending'
    };

    const { data, error } = await supabase
      .from('properties')
      .insert(propertyData)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      property: data
    });

  } catch (error) {
    console.error('Create property error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Update property
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check ownership
    const { data: property } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (property.owner_id !== req.user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', req.user.id)
        .single();

      if (!profile?.is_admin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, property: data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Search properties by location
router.get('/search/nearby', async (req, res) => {
  try {
    const { lat, lng, radius_km = 50 } = req.query;

    const { data, error } = await supabase
      .rpc('search_properties_nearby', {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        radius_km: parseFloat(radius_km)
      });

    if (error) throw error;

    res.json({ properties: data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
