import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_123");

// Email configuration
const INVITE_FROM_EMAIL = 'Pedigree Roots <invite@pedigreeroots.com>';
const SUPPORT_FROM_EMAIL = 'Pedigree Roots <support@pedigreeroots.com>';
const REPLY_TO_EMAIL = 'support@pedigreeroots.com';

// Detect if email is likely from Vietnam based on domain
function isVietnameseEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  // Check for .vn TLD or common Vietnamese email providers
  return domain.endsWith('.vn') || 
         domain.includes('.com.vn') ||
         domain.includes('fpt.') ||
         domain.includes('vnn.');
}

export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  personName: string;
  inviteUrl: string;
}) {
  const { to, inviterName, personName, inviteUrl } = params;
  const isVietnamese = isVietnameseEmail(to);

  const subject = isVietnamese 
    ? `${inviterName} mời bạn tham gia cây gia đình`
    : `${inviterName} invited you to join the family tree`;

  const html = isVietnamese ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Bạn được mời!</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>${inviterName}</strong> đã mời bạn nhận hồ sơ của mình với tên <strong>${personName}</strong> trong cây gia đình của họ.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background: #667eea; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Chấp nhận lời mời
            </a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
            Nếu bạn không mong đợi lời mời này, bạn có thể bỏ qua email này.
          </p>
        </div>
      </body>
    </html>
  ` : `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>${inviterName}</strong> has invited you to claim your profile as <strong>${personName}</strong> in their family tree.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background: #667eea; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const { data, error } = await resend.emails.send({
    from: INVITE_FROM_EMAIL,
    replyTo: REPLY_TO_EMAIL,
    to: [to],
    subject,
    html,
  });

  if (error) {
    console.error('Failed to send invitation email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}) {
  const { to, resetUrl } = params;
  const isVietnamese = isVietnameseEmail(to);

  const subject = isVietnamese 
    ? 'Đặt lại mật khẩu'
    : 'Reset your password';

  const html = isVietnamese ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1f2937; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Đặt lại mật khẩu</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">
            Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu của bạn.
          </p>
          <p style="font-size: 14px; color: #6b7280; margin-bottom: 25px;">
            Nhấn vào nút bên dưới để tạo mật khẩu mới. Liên kết này sẽ hết hạn sau 1 giờ.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #1f2937; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Đặt lại mật khẩu
            </a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
            Nếu bạn không yêu cầu đặt lại mật khẩu này, bạn có thể bỏ qua email này.
          </p>
        </div>
      </body>
    </html>
  ` : `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1f2937; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">
            We received a request to reset your password.
          </p>
          <p style="font-size: 14px; color: #6b7280; margin-bottom: 25px;">
            Click the button below to create a new password. This link will expire in 1 hour.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #1f2937; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const { data, error } = await resend.emails.send({
    from: SUPPORT_FROM_EMAIL,
    replyTo: REPLY_TO_EMAIL,
    to: [to],
    subject,
    html,
  });

  if (error) {
    console.error('Failed to send password reset email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
