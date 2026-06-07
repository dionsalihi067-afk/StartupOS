import type { Brand, EmailCampaign, EmailMessage, EmailType } from "@/lib/types";
import { nonEmpty, ensureArray } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { emailLlmSchema } from "@/lib/schemas";
import { getSwatch, readableTextColor } from "@/lib/engine/color";
import { escapeXml } from "@/lib/utils";
import type { AgentOutput, GenerationContext } from "@/lib/agents/context";

function renderEmailHtml(brand: Brand, subject: string, paragraphs: string[], cta: string): string {
  const primary = getSwatch(brand.palette, "primary");
  const surface = getSwatch(brand.palette, "surface");
  const ink = getSwatch(brand.palette, "neutral-dark");
  const onPrimary = readableTextColor(primary);
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${ink};">${escapeXml(p)}</p>`)
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(subject)}</title></head>
<body style="margin:0;background:${surface};font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${surface};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.06);">
        <tr><td style="background:${primary};padding:28px 32px;">
          <span style="font-size:22px;font-weight:800;color:${onPrimary};letter-spacing:-0.5px;">${escapeXml(brand.name)}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:${ink};font-weight:700;">${escapeXml(subject)}</h1>
          ${body}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:${primary};">
            <a href="#" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:${onPrimary};text-decoration:none;">${escapeXml(cta)}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 32px;border-top:1px solid #eee;font-size:13px;color:#888;">
          ${escapeXml(brand.name)} · ${escapeXml(brand.slogan)}<br>You're receiving this because you signed up. <a href="#" style="color:#888;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const EMAIL_TYPES: EmailType[] = ["welcome", "follow-up", "sales", "re-engagement"];

function deterministicSequence(ctx: GenerationContext, brand: Brand): { name: string; goal: string; raw: { type: EmailType; day: number; subject: string; preview: string; goal: string; paragraphs: string[]; cta: string }[] } {
  const { input, industry } = ctx;
  const aud = input.audience.toLowerCase();
  return {
    name: `${brand.name} Welcome & Nurture Sequence`,
    goal: "Convert new subscribers into first-time customers within 7 days.",
    raw: [
      {
        type: "welcome",
        day: 0,
        subject: `Welcome to ${brand.name} 👋`,
        preview: `We're so glad you're here. Here's what to expect.`,
        goal: "Welcome & set expectations",
        paragraphs: [
          `Hi there — welcome to ${brand.name}!`,
          `${brand.description.split(".")[0]}. We created ${brand.name} for ${aud} who want ${industry.valueProps[0]?.toLowerCase() ?? "something better"}.`,
          `Over the next few days we'll show you exactly how we can help. For now, take a look around — we think you'll like what you find.`,
        ],
        cta: "Explore now",
      },
      {
        type: "follow-up",
        day: 2,
        subject: `The ${brand.name} difference`,
        preview: `Why ${input.location} is choosing us.`,
        goal: "Build trust & differentiate",
        paragraphs: [
          `Choosing the right ${industry.label.toLowerCase()} option isn't easy. So here's what makes ${brand.name} different.`,
          `${industry.valueProps[1] ?? "We obsess over quality"}. ${industry.valueProps[2] ?? "And we treat every customer like family."}`,
          `That's not marketing speak — it's how we operate every single day.`,
        ],
        cta: "See how it works",
      },
      {
        type: "sales",
        day: 4,
        subject: `A little something for you`,
        preview: `An exclusive offer to get you started.`,
        goal: "Drive first conversion",
        paragraphs: [
          `Ready to experience ${brand.name} for yourself?`,
          `As a welcome gift, we'd love to make your first step easy. Use this as your nudge to finally give us a try.`,
          `Spots/availability can be limited, so don't wait too long.`,
        ],
        cta: "Claim your offer",
      },
      {
        type: "re-engagement",
        day: 7,
        subject: `Still thinking about it?`,
        preview: `No pressure — just here when you're ready.`,
        goal: "Re-engage & overcome objections",
        paragraphs: [
          `We get it — trying something new takes a leap.`,
          `If you have questions, just reply to this email. A real person (not a bot) will help you out.`,
          `Whenever you're ready, ${brand.name} will be right here for you.`,
        ],
        cta: "Get in touch",
      },
    ],
  };
}

export async function runEmailAgent(ctx: GenerationContext, brand: Brand): Promise<AgentOutput<EmailCampaign>> {
  const det = deterministicSequence(ctx, brand);
  const buildFromRaw = (raw: typeof det.raw): EmailMessage[] =>
    raw.map((m) => ({
      type: m.type,
      day: m.day,
      subject: m.subject,
      preview: m.preview,
      goal: m.goal,
      bodyHtml: renderEmailHtml(brand, m.subject, m.paragraphs, m.cta),
      bodyText: `${m.subject}\n\n${m.paragraphs.join("\n\n")}\n\n[${m.cta}]`,
    }));

  if (!ctx.useLlm) {
    return { data: { name: det.name, goal: det.goal, sequence: buildFromRaw(det.raw) }, source: "deterministic" };
  }

  const res = await generateJson<unknown>({
    system: "You are an email marketing expert. Write a high-converting, ready-to-send sequence in the brand's voice. No lorem ipsum, no placeholders.",
    user: `Return JSON: name, goal, sequence of EXACTLY 4 emails in this order — (1) Welcome email (day 0), (2) Follow-up email (day 2), (3) Sales email with a clear offer (day 4), (4) Re-engagement email (day 7). Each: {day, subject (with optional emoji), preview, goal, body (2-3 short paragraphs separated by \\n\\n)}.
Brand: ${brand.name} — "${brand.slogan}"
Voice: ${brand.voice.join(", ")}
Business: ${ctx.input.idea}
Audience: ${ctx.input.audience}`,
    temperature: 0.8,
    maxTokens: 1900,
  });

  const parsed = emailLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return { data: { name: det.name, goal: det.goal, sequence: buildFromRaw(det.raw) }, source: "deterministic", note: res.note };
  }
  const d = parsed.data;
  const seq = ensureArray(d.sequence, []);
  if (seq.length === 0) {
    return { data: { name: det.name, goal: det.goal, sequence: buildFromRaw(det.raw) }, source: "deterministic", note: "empty-sequence" };
  }

  const messages: EmailMessage[] = seq.map((m, i) => {
    const subject = nonEmpty(m.subject, det.raw[i]?.subject ?? `Message ${i + 1}`);
    const paragraphs = nonEmpty(m.body, det.raw[i]?.paragraphs.join("\n\n") ?? "").split(/\n\n+/).filter(Boolean);
    const cta = det.raw[i]?.cta ?? "Learn more";
    return {
      type: det.raw[i]?.type ?? EMAIL_TYPES[i] ?? "follow-up",
      day: typeof m.day === "number" ? m.day : det.raw[i]?.day ?? i * 2,
      subject,
      preview: nonEmpty(m.preview, det.raw[i]?.preview ?? ""),
      goal: nonEmpty(m.goal, det.raw[i]?.goal ?? ""),
      bodyHtml: renderEmailHtml(brand, subject, paragraphs.length ? paragraphs : ["..."], cta),
      bodyText: `${subject}\n\n${paragraphs.join("\n\n")}\n\n[${cta}]`,
    };
  });

  return { data: { name: nonEmpty(d.name, det.name), goal: nonEmpty(d.goal, det.goal), sequence: messages }, source: "llm" };
}
