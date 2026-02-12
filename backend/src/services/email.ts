import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import logger from '../logger';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

class EmailService {
    private transporter: Transporter | null = null;
    private fromEmail: string;
    private fromName: string;

    constructor() {
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@nexvote.app';
        this.fromName = process.env.EMAIL_FROM_NAME || 'NexVote';
        this.initialize();
    }

    private initialize(): void {
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
        const smtpUser = process.env.SMTP_USER;
        const smtpKey = process.env.SMTP_KEY;

        if (!smtpHost || !smtpUser || !smtpKey) {
            logger.warn('Email service not configured - emails will not be sent');
            return;
        }

        this.transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpKey,
            },
        });

        logger.info({ host: smtpHost, port: smtpPort }, 'Email service initialized');
    }

    async send(options: EmailOptions): Promise<boolean> {
        if (!this.transporter) {
            logger.warn({ to: options.to }, 'Email not sent - service not configured');
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                text: options.text || options.html.replace(/<[^>]*>/g, ''),
                html: options.html,
            });

            logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully');
            return true;
        } catch (error) {
            logger.error({ err: error, to: options.to }, 'Failed to send email');
            return false;
        }
    }

    async sendVerificationCode(email: string, code: string, displayName: string): Promise<boolean> {
        return this.send({
            to: email,
            subject: 'Verify your NexVote account',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #600AFF 0%, #8B5CF6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                        .code { background: white; border: 2px solid #600AFF; border-radius: 8px; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #600AFF; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Welcome to NexVote</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${displayName},</p>
                            <p>Thank you for registering with NexVote. Please use the verification code below to complete your registration:</p>
                            <div class="code">${code}</div>
                            <p>This code will expire in 10 minutes.</p>
                            <p>If you didn't request this code, please ignore this email.</p>
                        </div>
                        <div class="footer">
                            <p>NexVote - Community-first decision-making platform</p>
                            <p>Vote for schemes, not people</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });
    }

    async sendProposalNotification(email: string, proposalTitle: string, communityName: string): Promise<boolean> {
        return this.send({
            to: email,
            subject: `New proposal in ${communityName}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #600AFF 0%, #8B5CF6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                        .proposal-title { background: white; border-left: 4px solid #600AFF; padding: 15px; margin: 20px 0; font-weight: 600; }
                        .button { display: inline-block; background: #600AFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
                        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>New Proposal</h1>
                        </div>
                        <div class="content">
                            <p>A new proposal has been created in <strong>${communityName}</strong>:</p>
                            <div class="proposal-title">${proposalTitle}</div>
                            <p>Visit NexVote to review and vote on this proposal.</p>
                            <a href="https://nexvote.app" class="button">View Proposal</a>
                        </div>
                        <div class="footer">
                            <p>NexVote - Community-first decision-making platform</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });
    }

    async sendVoteConfirmation(email: string, proposalTitle: string, voteChoice: string): Promise<boolean> {
        return this.send({
            to: email,
            subject: 'Vote recorded on NexVote',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #600AFF 0%, #8B5CF6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                        .vote-box { background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
                        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Vote Recorded</h1>
                        </div>
                        <div class="content">
                            <p>Your vote has been successfully recorded on the blockchain.</p>
                            <div class="vote-box">
                                <p><strong>Proposal:</strong> ${proposalTitle}</p>
                                <p><strong>Your Vote:</strong> ${voteChoice}</p>
                            </div>
                            <p>All votes are permanently recorded on Ethereum for transparency and auditability.</p>
                        </div>
                        <div class="footer">
                            <p>NexVote - Community-first decision-making platform</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });
    }
}

export const emailService = new EmailService();
