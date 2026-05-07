// @ts-nocheck
import nodemailer from "nodemailer";
import { Resend } from "resend";

interface ResendConnectionSettings {
  settings: {
    api_key: string;
    from_email: string;
  };
}

interface ResendConnectionListResponse {
  items?: ResendConnectionSettings[];
}

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string } | null> {
  // 1. Check standard environment variables first
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.EMAIL_FROM || "onboarding@resend.dev",
    };
  }

  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    if (!hostname) return null;

    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

    if (!xReplitToken) return null;

    const response = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    );

    if (!response.ok) {
      console.error(`[EMAIL] Resend connector fetch failed: HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as ResendConnectionListResponse;
    const connectionSettings = data.items?.[0];

    if (!connectionSettings?.settings?.api_key) {
      console.error("[EMAIL] Resend connector returned no api_key — check the integration is connected");
      return null;
    }

    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email,
    };
  } catch (err) {
    console.error("[EMAIL] Failed to fetch Resend credentials:", err);
    return null;
  }
}

async function getUncachableResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  const creds = await getResendCredentials();
  if (!creds) return null;
  return { client: new Resend(creds.apiKey), fromEmail: creds.fromEmail };
}

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

export async function sendPasswordResetEmail(
  to: string,
  code: string
): Promise<void> {
  const subject = "Your Esaal Password Reset Code";

  const text = `Your password reset code is: ${code}\n\nEnter this code on the reset page to set a new password. This code expires in 1 hour. If you didn't request this, you can safely ignore this email.`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Reset your password</h2>
      <p style="color: #475569; font-size: 16px; line-height: 24px;">You requested a password reset for your Esaal account. Please use the following 6-digit code to complete the process:</p>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 700; color: #0f766e; letter-spacing: 8px;">${code}</span>
      </div>
      <p style="color: #64748b; font-size: 14px;">This code expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Esaal Platform. All rights reserved.</p>
    </div>
  `;

  console.log(`[EMAIL] 🔑 RESET CODE FOR ${to}: ${code}`);

  const resend = await getUncachableResendClient();
  if (resend) {
    const from = resend.fromEmail ?? "onboarding@resend.dev";
    console.log(`[EMAIL] USING PROVIDER: RESEND (from: ${from})`);
    try {
      const { data, error } = await resend.client.emails.send({
        from,
        to,
        subject,
        text,
        html,
      });
      if (error) {
        console.error(`[EMAIL] Resend delivery error for ${to}:`, error);
        throw new Error(`Resend delivery failed: ${error.message}`);
      }
      console.log(`[EMAIL] Resend success for ${to}:`, data);
      return;
    } catch (err: any) {
      console.error(`[EMAIL] Resend exception for ${to}:`, err);
      // Fall through to SMTP if available
    }
  } else {
    console.log("[EMAIL] PROVIDER NOT CONFIGURED: RESEND");
  }

  // Try Brevo API as fallback/primary
  if (process.env.BREVO_API_KEY) {
    console.log(`[EMAIL] Attempting to send password reset email to ${to} via Brevo API...`);
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: { name: "Esaal Platform", email: process.env.SMTP_FROM || "medicalbookinghub@outlook.com" },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text
        })
      });

      if (response.ok) {
        console.log(`[EMAIL] Brevo API success for ${to}`);
        return;
      }
    } catch (err) {
      console.error(`[EMAIL] Brevo API exception for ${to}:`, err);
    }
  }

  const smtpTransporter = createSmtpTransporter();
  if (smtpTransporter) {
    const fromName = "Esaal Platform";
    const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const from = `${fromName} <${fromAddress}>`;
    console.log(`[EMAIL] USING PROVIDER: SMTP (from: ${from})`);
    try {
      await smtpTransporter.sendMail({ from, to, subject, text, html });
      console.log(`[EMAIL] SMTP success for ${to}`);
      return;
    } catch (err: any) {
      console.error(`[EMAIL] SMTP delivery failed for ${to}:`, err);
      throw err;
    }
  } else {
    console.log("[EMAIL] PROVIDER NOT CONFIGURED: SMTP");
  }

  console.warn(`[EMAIL] ⚠️ No email service configured. Reset code for ${to} is: ${code}`);
  if (process.env.NODE_ENV === "production") {
    throw new Error("No email service configured. Set up the Resend integration or SMTP environment variables.");
  }
}


export async function sendEmailVerificationEmail(
  to: string,
  token: string
): Promise<void> {
  const subject = "Verify your Esaal account";
  const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:8080");
  const verificationLink = `${appUrl}/verify-email?token=${token}`;

  const text = `Welcome to Esaal! Please verify your email address by clicking the link below:\n\n${verificationLink}\n\nIf you didn't create an account, you can safely ignore this email.`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Verify your email</h2>
      <p style="color: #475569; font-size: 16px; line-height: 24px;">Welcome to Esaal! To complete your registration, please verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verificationLink}" style="background-color: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Verify Email Address</a>
      </div>
      <p style="color: #64748b; font-size: 14px;">If the button above doesn't work, copy and paste this link into your browser:</p>
      <p style="color: #0f766e; font-size: 14px; word-break: break-all;">${verificationLink}</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Esaal Platform. All rights reserved.</p>
    </div>
  `;

  console.log(`[EMAIL] 📧 VERIFICATION LINK FOR ${to}: ${verificationLink}`);

  const resend = await getUncachableResendClient();
  if (resend) {
    const from = resend.fromEmail ?? "onboarding@resend.dev";
    console.log(`[EMAIL] Attempting to send verification email to ${to} via Resend (from: ${from})...`);
    try {
      const { data, error } = await resend.client.emails.send({ from, to, subject, text, html });
      if (error) {
        console.error(`[EMAIL] Resend verification delivery error for ${to}:`, error);
        throw new Error(`Resend delivery failed: ${error.message}`);
      }
      console.log(`[EMAIL] Resend verification success for ${to}:`, data);
      return;
    } catch (err: any) {
      console.error(`[EMAIL] Resend verification exception for ${to}:`, err);
      // Fall through to SMTP
    }
  }

  // Try Brevo API first as it's more reliable on Vercel than SMTP
  if (process.env.BREVO_API_KEY) {
    console.log(`[EMAIL] Attempting to send verification email to ${to} via Brevo API...`);
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: { name: "Esaal Platform", email: process.env.SMTP_FROM || "medicalbookinghub@outlook.com" },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text
        })
      });

      if (response.ok) {
        console.log(`[EMAIL] Brevo API success for ${to}`);
        return;
      } else {
        const errData = await response.json();
        console.error(`[EMAIL] Brevo API error:`, errData);
      }
    } catch (err) {
      console.error(`[EMAIL] Brevo API exception:`, err);
    }
  }

  const smtpTransporter = createSmtpTransporter();
  if (smtpTransporter) {
    const fromName = "Esaal Platform";
    const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const from = `${fromName} <${fromAddress}>`;
    console.log(`[EMAIL] Attempting to send verification email to ${to} via SMTP (from: ${from})...`);
    try {
      await smtpTransporter.sendMail({ from, to, subject, text, html });
      console.log(`[EMAIL] SMTP verification success for ${to}`);
      return;
    } catch (err: any) {
      console.error(`[EMAIL] SMTP verification delivery failed for ${to}:`, err);
      throw err;
    }
  }

  console.warn(`[EMAIL] ⚠️ No email service configured. Verification link for ${to} is: ${verificationLink}`);
  if (process.env.NODE_ENV === "production") {
    throw new Error("No email service configured. Set up the Brevo API Key or SMTP environment variables.");
  }
}

