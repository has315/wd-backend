import sgMail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error('SENDGRID_API_KEY environment variable is required');
}

try {
  console.log('Initializing SendGrid with API key...');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid initialized successfully');
} catch (error) {
  console.error('Failed to initialize SendGrid:', error);
  throw error;
}

interface EmailResponse {
  success: boolean;
  statusCode?: number;
  message: string;
  details?: string;
}

// Configuration for the service
const WISDOM_DROP_EMAIL = 'tim@wisdomdrop.com'; // Updated to match verified sender
const SENDER_NAME = 'Wisdom Drop';

export async function sendTestEmail(): Promise<EmailResponse> {
  try {
    console.log('Attempting to send test email...');
    const msg = {
      to: WISDOM_DROP_EMAIL,
      from: {
        email: WISDOM_DROP_EMAIL,
        name: SENDER_NAME,
      },
      subject: 'Wisdom Drop Email Service Test',
      text: 'The Wisdom Drop email service is functioning correctly.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Wisdom Drop Email Service Test</h2>
          <p>This email confirms that the Wisdom Drop email service is functioning correctly.</p>
          <p>Time sent: ${new Date().toISOString()}</p>
        </div>
      `,
    };

    console.log('Test email configuration:', {
      to: msg.to,
      from: msg.from,
      subject: msg.subject,
      apiKeyPresent: !!process.env.SENDGRID_API_KEY
    });

    const response = await sgMail.send(msg);
    console.log('SendGrid API Response:', response[0].statusCode);

    return {
      success: true,
      statusCode: response[0].statusCode,
      message: 'Email service is functioning correctly'
    };
  } catch (error: any) {
    console.error('Email Service Error:', {
      code: error.code,
      message: error.message,
      response: error.response?.body
    });

    // Log detailed error for debugging
    if (error.response?.body?.errors) {
      console.error('SendGrid Error Details:', error.response.body.errors);
    }

    return {
      success: false,
      message: 'Email service is currently unavailable',
      details: error.response?.body?.errors?.[0]?.message || error.message
    };
  }
}

// Function to send course lessons
export async function sendCourseLessonEmail(
  recipientEmail: string,
  lessonTitle: string,
  lessonContent: string
): Promise<EmailResponse> {
  try {
    const msg = {
      to: recipientEmail,
      from: {
        email: WISDOM_DROP_EMAIL,
        name: SENDER_NAME,
      },
      subject: `Your Wisdom Drop: ${lessonTitle}`,
      text: lessonContent,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${lessonTitle}</h2>
          ${lessonContent}
          <hr />
          <p style="color: #666; font-size: 12px;">
            Sent with ❤️ from Wisdom Drop
          </p>
        </div>
      `,
    };

    const response = await sgMail.send(msg);

    return {
      success: true,
      statusCode: response[0].statusCode,
      message: 'Lesson sent successfully'
    };
  } catch (error: any) {
    console.error('Failed to send lesson:', error);

    if (error.response?.body) {
      console.error('Service Details:', error.response.body);
    }

    return {
      success: false,
      message: 'Failed to deliver lesson',
      details: error.response?.body?.errors?.[0]?.message || error.message
    };
  }
}