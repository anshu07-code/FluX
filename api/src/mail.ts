import nodemailer from "nodemailer";

/**
 * Shared SMTP plumbing. Used by workflow email nodes AND by account emails
 * (password reset). Configuration comes from SMTP_HOST / SMTP_PORT /
 * SMTP_USER / SMTP_PASS / SMTP_FROM in the root .env.
 */

/** True when the three required SMTP variables are all present. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Lazy-initialized SMTP transporter (null when not configured). */
let _transporter: nodemailer.Transporter | null | undefined;
export function getSmtpTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    _transporter = null;
    console.log("[email] SMTP not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). Emails will be simulated.");
    return null;
  }
  _transporter = nodemailer.createTransport({
    host,
    port: port ? parseInt(port, 10) : 587,
    secure: port === "465",
    auth: { user, pass },
  });
  console.log(`[email] SMTP configured: ${host}:${port ?? 587}`);
  return _transporter;
}

export function smtpFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@flux.dev";
}
