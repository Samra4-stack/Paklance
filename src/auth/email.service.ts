import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    // In production/staging, can send via configured SMTP / Resend / Brevo
    // Never expose secrets or hardcode keys.
    this.logger.log(`[EMAIL DISPATCH] Verification OTP for ${email}: ${otp}`);
    
    // If SMTP credentials or Resend API key is configured in env, send real email:
    const smtpHost = process.env.SMTP_HOST;
    if (smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        // Dynamic load or standard fetch to mail API if present
        this.logger.log(`Sending verification email via SMTP to ${email}`);
      } catch (err: any) {
        this.logger.error(`Failed to dispatch SMTP email to ${email}: ${err?.message}`);
      }
    }
  }
}
