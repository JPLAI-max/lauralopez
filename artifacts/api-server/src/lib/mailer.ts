import { Resend } from "resend";
import { logger } from "./logger";

interface InquiryNotificationParams {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  affiliation: string;
  inquiryType: string;
  message: string;
  createdAt: Date;
}

export async function sendInquiryNotification(
  params: InquiryNotificationParams,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.INQUIRY_NOTIFY_EMAIL;
  const fromEmail =
    process.env.INQUIRY_FROM_EMAIL ?? "notifications@lauralopez.com";

  if (!apiKey || !notifyEmail) {
    logger.info(
      "email notification skipped — not configured (RESEND_API_KEY or INQUIRY_NOTIFY_EMAIL missing)",
    );
    return;
  }

  const resend = new Resend(apiKey);

  const subject = `New Inquiry — ${params.inquiryType} — ${params.fullName}`;
  const text = [
    `New inquiry received on the Laura Lopez website.`,
    ``,
    `ID:           ${params.id}`,
    `Received:     ${params.createdAt.toISOString()}`,
    ``,
    `Full Name:    ${params.fullName}`,
    `Email:        ${params.email}`,
    `Phone:        ${params.phone ?? "—"}`,
    `Affiliation:  ${params.affiliation}`,
    `Inquiry Type: ${params.inquiryType}`,
    ``,
    `Message:`,
    params.message,
  ].join("\n");

  try {
    await resend.emails.send({
      from: fromEmail,
      to: notifyEmail,
      replyTo: params.email,
      subject,
      text,
    });
    logger.info({ inquiryId: params.id }, "inquiry notification email sent");
  } catch (err) {
    logger.error({ err, inquiryId: params.id }, "failed to send inquiry notification email");
    throw err;
  }
}
