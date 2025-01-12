
import sgMail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SendGrid API key is required");
}

if (!process.env.SENDGRID_VERIFIED_SENDER) {
  throw new Error("SendGrid verified sender email is required");
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

type MessageChannel = 'email' | 'whatsapp' | 'sms';

export async function sendTestEmail() {
  try {
    const msg = {
      to: 'tlb.thiele@gmail.com',
      from: process.env.SENDGRID_VERIFIED_SENDER as string,
      subject: 'Test Email from Wisdom Drop',
      text: 'This is a test email from Wisdom Drop.',
      html: '<h1>Test Email</h1><p>This is a test email from Wisdom Drop.</p>'
    };

    const response = await sgMail.send(msg);
    console.log('Test email sent successfully:', response[0].statusCode);
    return response;
  } catch (error) {
    console.error('Error sending test email:', error);
    throw error;
  }
}

export async function sendMessage(to: string, content: string, channel: MessageChannel) {
  try {
    switch (channel) {
      case 'email':
        const msg = {
          to,
          from: process.env.SENDGRID_VERIFIED_SENDER,
          subject: 'Your Daily Wisdom',
          html: content,
          text: content.replace(/<[^>]*>/g, '')
        };
        const response = await sgMail.send(msg);
        console.log('Email sent successfully:', response[0].statusCode);
        return response;
      case 'whatsapp':
      case 'sms':
        throw new Error(`${channel} channel not yet implemented`);
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}
