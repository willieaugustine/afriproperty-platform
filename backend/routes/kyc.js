const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../lib/supabase');
const { authenticateUser } = require('../middleware/auth');

// Submit KYC
router.post('/submit', authenticateUser, async (req, res) => {
  try {
    const {
      full_name,
      phone_number,
      id_type,
      id_number,
      address_line1,
      address_line2,
      city,
      state_province,
      postal_code,
      country
    } = req.body;

    // Update profile with KYC information
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name,
        phone_number,
        id_type,
        id_number,
        address_line1,
        address_line2,
        city,
        state_province,
        postal_code,
        country,
        kyc_status: 'submitted',
        kyc_submitted_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    // Create notification
    await supabase.from('notifications').insert({
      user_id: req.user.id,
      title: 'KYC Submitted',
      message: 'Your KYC information has been submitted and is under review.',
      notification_type: 'kyc'
    });

    res.json({
      success: true,
      message: 'KYC submitted successfully',
      profile: data
    });

  } catch (error) {
    console.error('KYC submission error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify KYC (Admin only)
router.post('/verify/:user_id', authenticateUser, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { tier, status, rejection_reason } = req.body;

    // Check if requester is admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();

    if (!adminProfile?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const updateData = {
      kyc_status: status,
      kyc_tier: status === 'verified' ? tier : 1
    };

    if (status === 'verified') {
      updateData.kyc_verified_at = new Date().toISOString();
      updateData.is_verified = true;
    } else if (status === 'rejected') {
      updateData.kyc_rejection_reason = rejection_reason;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user_id)
      .select()
      .single();

    if (error) throw error;

    // Create notification
    await supabase.from('notifications').insert({
      user_id,
      title: status === 'verified' ? 'KYC Verified' : 'KYC Rejected',
      message: status === 'verified' 
        ? `Your KYC has been verified. You now have Tier ${tier} access.`
        : `Your KYC was rejected. Reason: ${rejection_reason}`,
      notification_type: 'kyc'
    });

    res.json({
      success: true,
      message: `KYC ${status}`,
      profile: data
    });

  } catch (error) {
    console.error('KYC verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get KYC status
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('kyc_status, kyc_tier, kyc_submitted_at, kyc_verified_at, kyc_rejection_reason')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json({ kyc: data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Integrate with external KYC provider (e.g., Smile Identity)
router.post('/verify-id', authenticateUser, async (req, res) => {
  try {
    const { id_number, id_type, country } = req.body;

    // Example: Smile Identity API call
    const smileResponse = await axios.post(
      'https://api.smileidentity.com/v1/id_verification',
      {
        partner_id: process.env.SMILE_PARTNER_ID,
        partner_params: {
          user_id: req.user.id,
          job_id: `kyc_${Date.now()}`
        },
        id_info: {
          country,
          id_type,
          id_number
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SMILE_API_KEY}`
        }
      }
    );

    // Process Smile Identity response
    const verified = smileResponse.data.ResultCode === 'Success';

    if (verified) {
      await supabase
        .from('profiles')
        .update({
          kyc_status: 'verified',
          kyc_tier: 2,
          kyc_verified_at: new Date().toISOString(),
          is_verified: true
        })
        .eq('id', req.user.id);
    }

    res.json({
      success: true,
      verified,
      details: smileResponse.data
    });

  } catch (error) {
    console.error('ID verification error:', error);
    res.status(500).json({ error: 'ID verification failed' });
  }
});

module.exports = router;

