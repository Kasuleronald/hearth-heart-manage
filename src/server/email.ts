import { createServerOnlyFn } from "@tanstack/react-start";
import nodemailer from "nodemailer";

// Optional: every function here degrades to a no-op (logging instead of
// throwing) when SMTP isn't configured, since email delivery isn't required
// for the app to work — invite/reset links still show directly in the
// SuperAdmin UI as a manual fallback either way (see superadmin.orgs.tsx).
function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    // Port 465 is implicit TLS; 587 (Gmail's default) starts plaintext and
    // upgrades via STARTTLS — nodemailer picks the right one from `secure`.
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user, pass },
  });
}

export const sendInviteEmail = createServerOnlyFn(
  async (params: {
    to: string;
    adminName: string;
    orgName: string;
    inviteLink: string;
  }): Promise<{ sent: boolean }> => {
    const transport = getTransport();
    if (!transport) {
      console.warn(
        `[email] SMTP not configured — invite link for ${params.to} was not emailed: ${params.inviteLink}`,
      );
      return { sent: false };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject: `You've been added as Admin of ${params.orgName} on My Church`,
        text: `Hi ${params.adminName},\n\nYou've been set up as the Administrator for ${params.orgName} on My Church.\n\nSet your password to get started: ${params.inviteLink}\n\nThis link expires in 1 hour.`,
        html: `<p>Hi ${params.adminName},</p><p>You've been set up as the Administrator for <strong>${params.orgName}</strong> on My Church.</p><p><a href="${params.inviteLink}">Set your password to get started</a></p><p>This link expires in 1 hour.</p>`,
      });
      return { sent: true };
    } catch (err) {
      console.error(`[email] Failed to send invite email to ${params.to}:`, err);
      return { sent: false };
    }
  },
);
