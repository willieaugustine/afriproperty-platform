const { supabase } = require('../server');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function createNotification(userId, title, message, type, metadata = {}) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        notification_type: type,
        metadata
      })
      .select()
      .single();

    if (error) throw error;

    // Send email notification
    await sendEmailNotification(userId, title, message);

    return data;
  } catch (error) {
    console.error('Notification error:', error);
    return null;
  }
}

async function sendEmailNotification(userId, subject, message) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (!profile?.email) return;

    const msg = {
      to: profile.email,
      from: process.env.FROM_EMAIL,
      subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Hello ${profile.full_name},</h2>
          <p>${message}</p>
          <br>
          <p>Best regards,<br>AfriProperty Team</p>
        </div>
      `
    };

    await sgMail.send(msg);
  } catch (error) {
    console.error('Email notification error:', error);
  }
}

module.exports = {
  createNotification,
  sendEmailNotification
};

// SQL Functions to add to Supabase
-- Function to get property stats
CREATE OR REPLACE FUNCTION get_property_stats(property_id UUID)
RETURNS TABLE (
  total_investors BIGINT,
  total_invested NUMERIC,
  tokens_remaining BIGINT,
  percentage_funded NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT i.investor_id)::BIGINT as total_investors,
    COALESCE(SUM(i.total_cost), 0) as total_invested,
    (p.token_supply - p.tokens_sold)::BIGINT as tokens_remaining,
    ROUND((p.tokens_sold::NUMERIC / p.token_supply * 100), 2) as percentage_funded
  FROM properties p
  LEFT JOIN investments i ON p.id = i.property_id AND i.payment_status = 'completed'
  WHERE p.id = property_id
  GROUP BY p.id, p.token_supply, p.tokens_sold;
END;
$$ LANGUAGE plpgsql;

-- Function to search properties nearby
CREATE OR REPLACE FUNCTION search_properties_nearby(
  lat FLOAT,
  lng FLOAT,
  radius_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  country TEXT,
  total_value NUMERIC,
  distance_km FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.country,
    p.total_value,
    ST_Distance(
      p.location::geometry,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geometry
    ) / 1000 as distance_km
  FROM properties p
  WHERE p.status = 'active'
    AND ST_DWithin(
      p.location::geometry,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geometry,
      radius_km * 1000
    )
  ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql;
