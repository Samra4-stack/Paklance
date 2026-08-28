import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initSmtpTransporter();
  }

  private initSmtpTransporter() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT, 10)
      : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    if (host && user && pass) {
      this.smtpTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });
      this.logger.log(
        `[EmailService] Initialized SMTP transporter (${host}:${port}, secure=${secure})`,
      );
    }
  }

  /**
   * Sends 6-digit email OTP verification email.
   * Throws an exception if no email provider is configured or if dispatch fails.
   */
  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    const subject = `Your Paklance Verification Code: ${otp}`;
    const text = `Welcome to Paklance! Your 6-digit verification code is: ${otp}\n\nThis code expires in 15 minutes.\nIf you did not request this, please ignore this email.`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f5; margin: 0; padding: 24px; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2ece5; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .logo { text-align: center; margin-bottom: 20px; font-weight: 800; font-size: 22px; color: #01411c; letter-spacing: -0.5px; }
          .title { font-size: 20px; font-weight: 700; color: #0b1f14; margin-bottom: 12px; text-align: center; }
          .text { font-size: 14px; color: #4a5c50; line-height: 1.6; margin-bottom: 24px; text-align: center; }
          .otp-box { background: #f0f7f2; border: 2px dashed #00a859; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #01411c; font-family: 'Courier New', monospace; }
          .footer { font-size: 12px; color: #829a8a; text-align: center; margin-top: 24px; border-top: 1px solid #edf3ef; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">&#9670; PAKLANCE</div>
          <div class="title">Verify your email address</div>
          <div class="text">Welcome to Paklance. Enter the 6-digit verification code below to activate your account and access the marketplace.</div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          <div class="text" style="font-size: 12px; color: #6b8071;">This code is valid for <strong>15 minutes</strong>. If you did not create a Paklance account, no action is needed.</div>
          <div class="footer">&copy; ${new Date().getFullYear()} Paklance Inc. SafePay Escrow & Freelance Marketplace</div>
        </div>
      </body>
      </html>
    `;

    await this.sendMail({ to: email, subject, text, html });
  }

  /**
   * Dispatches email via the configured provider (Resend, SendGrid, Brevo, or SMTP).
   * Throws an explicit error if delivery fails.
   */
  async sendMail(options: SendEmailOptions): Promise<void> {
    const fromAddress =
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      'Paklance <support@paklance.com>';

    // 1. Priority: Resend REST API (Recommended for Vercel serverless)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [options.to],
            subject: options.subject,
            html: options.html,
            text: options.text,
          }),
        });

        const resData = await response.json();
        if (!response.ok) {
          const errMsg = resData?.message || JSON.stringify(resData);
          this.logger.error(`[Resend API Error] HTTP ${response.status}: ${errMsg}`);
          throw new BadGatewayException(
            `Email provider (Resend) error: ${errMsg}`,
          );
        }

        this.logger.log(`[EmailService] Dispatched email via Resend to ${options.to} (ID: ${resData?.id})`);
        return;
      } catch (err: any) {
        if (err instanceof BadGatewayException) throw err;
        this.logger.error(`[Resend Dispatch Failed]: ${err?.message}`);
        throw new ServiceUnavailableException(
          `Unable to deliver verification email via Resend: ${err?.message}`,
        );
      }
    }

    // 2. Priority: SendGrid REST API
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (sendgridApiKey) {
      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: options.to }] }],
            from: {
              email:
                process.env.SENDGRID_FROM ||
                fromAddress.replace(/.*<(.+)>/, '$1'),
            },
            subject: options.subject,
            content: [
              { type: 'text/plain', value: options.text },
              { type: 'html', value: options.html },
            ],
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          this.logger.error(`[SendGrid API Error] HTTP ${response.status}: ${errBody}`);
          throw new BadGatewayException(
            `Email provider (SendGrid) error: ${errBody}`,
          );
        }

        this.logger.log(`[EmailService] Dispatched email via SendGrid to ${options.to}`);
        return;
      } catch (err: any) {
        if (err instanceof BadGatewayException) throw err;
        this.logger.error(`[SendGrid Dispatch Failed]: ${err?.message}`);
        throw new ServiceUnavailableException(
          `Unable to deliver verification email via SendGrid: ${err?.message}`,
        );
      }
    }

    // 3. Priority: Brevo (Sendinblue) REST API
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (brevoApiKey) {
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: {
              name: 'Paklance',
              email:
                process.env.BREVO_FROM ||
                fromAddress.replace(/.*<(.+)>/, '$1'),
            },
            to: [{ email: options.to }],
            subject: options.subject,
            htmlContent: options.html,
            textContent: options.text,
          }),
        });

        const resData = await response.json();
        if (!response.ok) {
          const errMsg = resData?.message || JSON.stringify(resData);
          this.logger.error(`[Brevo API Error] HTTP ${response.status}: ${errMsg}`);
          throw new BadGatewayException(
            `Email provider (Brevo) error: ${errMsg}`,
          );
        }

        this.logger.log(`[EmailService] Dispatched email via Brevo to ${options.to}`);
        return;
      } catch (err: any) {
        if (err instanceof BadGatewayException) throw err;
        this.logger.error(`[Brevo Dispatch Failed]: ${err?.message}`);
        throw new ServiceUnavailableException(
          `Unable to deliver verification email via Brevo: ${err?.message}`,
        );
      }
    }

    // 4. Priority: Standard SMTP via Nodemailer
    if (this.smtpTransporter || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
      if (!this.smtpTransporter) {
        this.initSmtpTransporter();
      }
      if (this.smtpTransporter) {
        try {
          const info = await this.smtpTransporter.sendMail({
            from: fromAddress,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
          });
          this.logger.log(`[EmailService] Dispatched email via SMTP to ${options.to} (MessageId: ${info.messageId})`);
          return;
        } catch (err: any) {
          this.logger.error(`[SMTP Dispatch Failed]: ${err?.message}`);
          throw new ServiceUnavailableException(
            `SMTP email delivery failed: ${err?.message}`,
          );
        }
      }
    }

    // 5. If no real email provider is configured:
    this.logger.error(
      `[EmailService] No email provider configured! Set RESEND_API_KEY, SENDGRID_API_KEY, BREVO_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS in environment variables.`,
    );
    throw new ServiceUnavailableException(
      'Email delivery service is currently not configured for this environment. Please configure RESEND_API_KEY or SMTP credentials.',
    );
  }
}
