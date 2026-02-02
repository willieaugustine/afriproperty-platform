const express = require('express');
const router = express.Router();
const axios = require('axios');
const { supabase } = require('../server');
const { authenticateUser } = require('../middleware/auth');

// M-Pesa configuration
const MPESA_CONFIG = {
  consumer_key: process.env.MPESA_CONSUMER_KEY,
  consumer_secret: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE,
  passkey: process.env.MPESA_PASSKEY,
  callback_url: process.env.MPESA_CALLBACK_URL,
  base_url: process.env.MPESA_ENV === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke'
};

// Get M-Pesa access token
async function getMpesaAccessToken() {
  const auth = Buffer.from(
    `${MPESA_CONFIG.consumer_key}:${MPESA_CONFIG.consumer_secret}`
  ).toString('base64');

  const response = await axios.get(
    `${MPESA_CONFIG.base_url}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );

  return response.data.access_token;
}

// Generate M-Pesa password
function generateMpesaPassword(timestamp) {
  const data = MPESA_CONFIG.shortcode + MPESA_CONFIG.passkey + timestamp;
  return Buffer.from(data).toString('base64');
}

// Initiate STK Push
router.post('/mpesa/stk-push', authenticateUser, async (req, res) => {
  try {
    const { investment_id, phone_number, amount } = req.body;

    // Validate phone number (should be in format 254XXXXXXXXX)
    const cleanPhone = phone_number.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('254') 
      ? cleanPhone 
      : '254' + cleanPhone.substring(cleanPhone.length - 9);

    // Get investment details
    const { data: investment } = await supabase
      .from('investments')
      .select('*')
      .eq('id', investment_id)
      .single();

    if (!investment || investment.investor_id !== req.user.id) {
      return res.status(403).json({ error: 'Invalid investment' });
    }

    // Get access token
    const accessToken = await getMpesaAccessToken();

    // Prepare STK Push request
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').substring(0, 14);
    const password = generateMpesaPassword(timestamp);

    const stkPushData = {
      BusinessShortCode: MPESA_CONFIG.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount), // M-Pesa requires integer
      PartyA: formattedPhone,
      PartyB: MPESA_CONFIG.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CONFIG.callback_url,
      AccountReference: investment_id,
      TransactionDesc: 'AfriProperty Investment'
    };

    const response = await axios.post(
      `${MPESA_CONFIG.base_url}/mpesa/stkpush/v1/processrequest`,
      stkPushData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    // Save M-Pesa transaction
    const { data: mpesaTransaction } = await supabase
      .from('mpesa_transactions')
      .insert({
        investment_id,
        merchant_request_id: response.data.MerchantRequestID,
        checkout_request_id: response.data.CheckoutRequestID,
        phone_number: formattedPhone,
        amount,
        status: 'pending'
      })
      .select()
      .single();

    res.json({
      success: true,
      message: 'STK push sent successfully',
      checkout_request_id: response.data.CheckoutRequestID,
      transaction: mpesaTransaction
    });

  } catch (error) {
    console.error('M-Pesa STK Push error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to initiate payment',
      details: error.response?.data || error.message 
    });
  }
});

// M-Pesa callback
router.post('/mpesa/callback', async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body;

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc
    } = stkCallback;

    // Get M-Pesa transaction
    const { data: mpesaTransaction } = await supabase
      .from('mpesa_transactions')
      .select('*')
      .eq('checkout_request_id', CheckoutRequestID)
      .single();

    if (!mpesaTransaction) {
      console.error('M-Pesa transaction not found:', CheckoutRequestID);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Update M-Pesa transaction
    const updateData = {
      result_code: ResultCode,
      result_desc: ResultDesc,
      callback_metadata: stkCallback.CallbackMetadata,
      status: ResultCode === 0 ? 'completed' : 'failed'
    };

    if (ResultCode === 0 && stkCallback.CallbackMetadata) {
      // Extract M-Pesa receipt number
      const items = stkCallback.CallbackMetadata.Item;
      const receiptItem = items.find(item => item.Name === 'MpesaReceiptNumber');
      if (receiptItem) {
        updateData.mpesa_receipt_number = receiptItem.Value;
        updateData.transaction_date = new Date().toISOString();
      }
    }

    await supabase
      .from('mpesa_transactions')
      .update(updateData)
      .eq('id', mpesaTransaction.id);

    // Update investment if payment successful
    if (ResultCode === 0) {
      await supabase
        .from('investments')
        .update({
          payment_status: 'completed',
          payment_reference: updateData.mpesa_receipt_number,
          paid_at: new Date().toISOString()
        })
        .eq('id', mpesaTransaction.investment_id);

      // Create notification
      const { data: investment } = await supabase
        .from('investments')
        .select('investor_id, property_id')
        .eq('id', mpesaTransaction.investment_id)
        .single();

      await supabase.from('notifications').insert({
        user_id: investment.investor_id,
        title: 'Payment Successful',
        message: `Your payment of KES ${mpesaTransaction.amount} was successful. Receipt: ${updateData.mpesa_receipt_number}`,
        notification_type: 'investment'
      });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

// Check payment status
router.get('/mpesa/status/:checkout_request_id', authenticateUser, async (req, res) => {
  try {
    const { checkout_request_id } = req.params;

    const { data, error } = await supabase
      .from('mpesa_transactions')
      .select(`
        *,
        investments (
          investor_id,
          property_id
        )
      `)
      .eq('checkout_request_id', checkout_request_id)
      .single();

    if (error) throw error;

    // Check if user owns this transaction
    if (data.investments.investor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ transaction: data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Withdraw to M-Pesa (for rental income)
router.post('/mpesa/withdraw', authenticateUser, async (req, res) => {
  try {
    const { phone_number, amount, claim_id } = req.body;

    // Validate claim belongs to user
    const { data: claim } = await supabase
      .from('rental_claims')
      .select('*')
      .eq('id', claim_id)
      .eq('investor_id', req.user.id)
      .single();

    if (!claim || claim.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid claim' });
    }

    // Get access token
    const accessToken = await getMpesaAccessToken();

    // Format phone number
    const cleanPhone = phone_number.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('254') 
      ? cleanPhone 
      : '254' + cleanPhone.substring(cleanPhone.length - 9);

    // Initiate B2C (withdrawal)
    const b2cData = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: Math.ceil(amount),
      PartyA: MPESA_CONFIG.shortcode,
      PartyB: formattedPhone,
      Remarks: 'AfriProperty Rental Payment',
      QueueTimeOutURL: `${MPESA_CONFIG.callback_url}/timeout`,
      ResultURL: `${MPESA_CONFIG.callback_url}/b2c`,
      Occasion: `Rental-${claim_id}`
    };

    const response = await axios.post(
      `${MPESA_CONFIG.base_url}/mpesa/b2c/v1/paymentrequest`,
      b2cData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    // Update claim
    await supabase
      .from('rental_claims')
      .update({
        status: 'processing',
        payment_method: 'mpesa',
        payment_reference: response.data.ConversationID
      })
      .eq('id', claim_id);

    res.json({
      success: true,
      message: 'Withdrawal initiated',
      conversation_id: response.data.ConversationID
    });

  } catch (error) {
    console.error('M-Pesa B2C error:', error.response?.data || error);
    res.status(500).json({ 
      error: 'Failed to process withdrawal',
      details: error.response?.data || error.message 
    });
  }
});

module.exports = router;

