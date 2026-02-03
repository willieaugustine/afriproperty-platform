const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticateUser } = require('../middleware/auth');

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name, phone_number } = req.body;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          phone_number
        }
      }
    });

    if (authError) throw authError;

    res.json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user: authData.user
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Sign in
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Update last login
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    // Log session
    await supabase.from('user_sessions').insert({
      user_id: data.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    res.json({
      success: true,
      session: data.session,
      user: data.user
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(401).json({ error: error.message });
  }
});

// Get current user
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json({ user: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update profile
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const updates = req.body;
    delete updates.id; // Prevent ID change
    delete updates.email; // Prevent email change

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, profile: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Connect wallet
router.post('/connect-wallet', authenticateUser, async (req, res) => {
  try {
    const { wallet_address, signature } = req.body;

    // Verify signature (implement signature verification)
    // For now, just update the wallet address

    const { data, error } = await supabase
      .from('profiles')
      .update({ wallet_address })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, profile: data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
