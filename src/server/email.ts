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
    kind?: "invite" | "reset";
  }): Promise<{ sent: boolean }> => {
    const transport = getTransport();
    const label = params.kind === "reset" ? "password reset" : "invite";
    if (!transport) {
      console.warn(
        `[email] SMTP not configured — ${label} link for ${params.to} was not emailed: ${params.inviteLink}`,
      );
      return { sent: false };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const subject =
      params.kind === "reset"
        ? `Reset your My Church password for ${params.orgName}`
        : `You've been added as Admin of ${params.orgName} on My Church`;
    const intro =
      params.kind === "reset"
        ? `A password reset was requested for your account on <strong>${params.orgName}</strong>.`
        : `You've been set up as the Administrator for <strong>${params.orgName}</strong> on My Church.`;
    const introText =
      params.kind === "reset"
        ? `A password reset was requested for your account on ${params.orgName}.`
        : `You've been set up as the Administrator for ${params.orgName} on My Church.`;
    const cta = params.kind === "reset" ? "Set a new password" : "Set your password to get started";
    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject,
        text: `Hi ${params.adminName},\n\n${introText}\n\n${cta}: ${params.inviteLink}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
        html: `<p>Hi ${params.adminName},</p><p>${intro}</p><p><a href="${params.inviteLink}">${cta}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
      });
      return { sent: true };
    } catch (err) {
      console.error(`[email] Failed to send ${label} email to ${params.to}:`, err);
      return { sent: false };
    }
  },
);

export const sendEventNotificationEmail = createServerOnlyFn(
  async (params: {
    to: string;
    recipientName: string;
    eventTitle: string;
    eventDateLabel: string;
    orgName: string;
    eventLink?: string;
  }): Promise<{ sent: boolean }> => {
    const transport = getTransport();
    if (!transport) {
      console.warn(
        `[email] SMTP not configured — event notification for ${params.to} was not emailed: ${params.eventTitle}`,
      );
      return { sent: false };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const subject = `New event at ${params.orgName}: ${params.eventTitle}`;
    const linkText = params.eventLink ? `\n\nView it here: ${params.eventLink}` : "";
    const linkHtml = params.eventLink
      ? `<p><a href="${params.eventLink}">View event details</a></p>`
      : "";
    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject,
        text: `Hi ${params.recipientName},\n\nA new event has been posted at ${params.orgName}:\n\n${params.eventTitle}\n${params.eventDateLabel}${linkText}`,
        html: `<p>Hi ${params.recipientName},</p><p>A new event has been posted at <strong>${params.orgName}</strong>:</p><p><strong>${params.eventTitle}</strong><br>${params.eventDateLabel}</p>${linkHtml}`,
      });
      return { sent: true };
    } catch (err) {
      console.error(`[email] Failed to send event notification email to ${params.to}:`, err);
      return { sent: false };
    }
  },
);

export const sendEventReportEmail = createServerOnlyFn(
  async (params: {
    to: string;
    recipientName: string;
    eventTitle: string;
    eventDateLabel: string;
    orgName: string;
    submittedByName: string;
    eventLink?: string;
  }): Promise<{ sent: boolean }> => {
    const transport = getTransport();
    if (!transport) {
      console.warn(
        `[email] SMTP not configured — event report for ${params.to} was not emailed: ${params.eventTitle}`,
      );
      return { sent: false };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const subject = `Event report: ${params.eventTitle}`;
    const linkText = params.eventLink ? `\n\nView it here: ${params.eventLink}` : "";
    const linkHtml = params.eventLink
      ? `<p><a href="${params.eventLink}">View full report</a></p>`
      : "";
    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject,
        text: `Hi ${params.recipientName},\n\n${params.submittedByName} submitted a report for ${params.eventTitle} (${params.eventDateLabel}) at ${params.orgName}.${linkText}`,
        html: `<p>Hi ${params.recipientName},</p><p>${params.submittedByName} submitted a report for <strong>${params.eventTitle}</strong> (${params.eventDateLabel}) at <strong>${params.orgName}</strong>.</p>${linkHtml}`,
      });
      return { sent: true };
    } catch (err) {
      console.error(`[email] Failed to send event report email to ${params.to}:`, err);
      return { sent: false };
    }
  },
);
