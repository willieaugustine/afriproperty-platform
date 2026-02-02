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


