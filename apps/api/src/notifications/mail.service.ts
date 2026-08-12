import { Inject, Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "@alkeva/shared";
import { ENV } from "../core/core.module.js";

/**
 * Provider-agnostic SMTP (free tiers: Brevo, Gmail app password). Unconfigured
 * is a supported state — senders get "skipped" back and the notification row
 * still records the event. Email must never be the reason money code throws.
 */
@Injectable()
export class MailService {
  private transport: Transporter | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured(): boolean {
    return this.env.SMTP_HOST.length > 0;
  }

  async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<"sent" | "failed" | "skipped"> {
    if (!this.configured) return "skipped";
    try {
      this.transport ??= nodemailer.createTransport({
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_PORT === 465,
        auth:
          this.env.SMTP_USER.length > 0
            ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS }
            : undefined,
      });
      await this.transport.sendMail({ from: this.env.MAIL_FROM, to, subject, html });
      return "sent";
    } catch (err) {
      console.error(`mail send failed (${subject} → ${to}):`, err);
      return "failed";
    }
  }
}
