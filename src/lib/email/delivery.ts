import "server-only";

/**
 * Transactional email for auth (password reset). Delivery uses Resend's HTTPS API
 * when EMAIL_FROM + RESEND_API_KEY are set. Secrets never leave the server.
 *
 * In `NODE_ENV=test` (or EMAIL_TEST_SINK=1) messages go to an in-memory sink so
 * lifecycle tests can assert without network calls.
 */

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const testInbox: OutboundEmail[] = [];

export function isEmailDeliveryConfigured(source: NodeJS.ProcessEnv = process.env): boolean {
  if (source.NODE_ENV === "test" || source.EMAIL_TEST_SINK === "1") return true;
  return Boolean(source.EMAIL_FROM?.trim() && source.RESEND_API_KEY?.trim());
}

export function drainTestInbox(): OutboundEmail[] {
  return testInbox.splice(0, testInbox.length);
}

export function peekTestInbox(): readonly OutboundEmail[] {
  return testInbox;
}

export async function sendTransactionalEmail(message: OutboundEmail): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.EMAIL_TEST_SINK === "1") {
    testInbox.push(message);
    return;
  }

  const from = process.env.EMAIL_FROM?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!from || !apiKey) {
    throw new Error("Email delivery is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });

  if (!res.ok) {
    // Do not include response body — providers may echo addresses or partial secrets.
    throw new Error(`Email delivery failed (${res.status})`);
  }
}
