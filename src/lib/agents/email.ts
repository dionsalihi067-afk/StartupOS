import type { Brand, EmailCampaign, EmailMessage } from "@/lib/types";
import { nonEmpty, ensureArray, midSentence } from "@/lib/utils";
import { generateJson } from "@/lib/ai/client";
import { emailLlmSchema } from "@/lib/schemas";
import { getSwatch, readableTextColor } from "@/lib/engine/color";
import { escapeXml } from "@/lib/utils";
import { fallbackNote, withBrief, withLlmTelemetry, withResearch, type AgentOutput, type GenerationContext } from "@/lib/agents/context";
import { audiencePhrase, copyBrief, type CopyBrief } from "@/lib/agents/copy-brief";
import { languageInstruction } from "@/lib/agents/language";

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

function deterministicSequence(
  ctx: GenerationContext,
  brand: Brand,
  brief: CopyBrief,
): { name: string; goal: string; raw: { day: number; subject: string; preview: string; goal: string; paragraphs: string[]; cta: string }[] } {
  const aud = midSentence(audiencePhrase(brief) || "you");
  const offering = brief.offering;
  const place = brief.location ? ` in ${brief.location}` : "";
  const problemLine = brief.problem
    ? `We started ${brand.name} because too many people ${midSentence(brief.problem)}.`
    : `${brand.description.split(".")[0]}.`;
  const diffLine = brief.differentiator
    ? brief.differentiator.replace(/\.$/, "") + "."
    : ctx.industry.valueProps[0]
      ? `${ctx.industry.valueProps[0]}.`
      : `We keep the focus on ${offering}.`;

  const goal = brief.earlyStage
    ? `Introduce ${offering} and invite early interest without inventing results.`
    : `Help subscribers understand ${offering} and take a clear next step.`;

  return {
    name: `${brand.name} welcome sequence`,
    goal,
    raw: [
      {
        day: 0,
        subject: `Welcome to ${brand.name}`,
        preview: `A short note about ${offering}.`,
        goal: "Welcome & set expectations",
        paragraphs: [
          `Hi — thanks for joining ${brand.name}.`,
          `${problemLine} We work with ${aud}${place}.`,
          `Over the next few emails we will explain what ${offering} looks like and how to ask questions. No pressure and no invented offers.`,
        ],
        cta: "Learn more",
      },
      {
        day: 2,
        subject: `What ${brand.name} focuses on`,
        preview: `How we approach ${offering}.`,
        goal: "Clarify the offer",
        paragraphs: [
          `Here is the short version of what we do: ${offering}.`,
          diffLine,
          `If something is unclear, reply to this email — a real person will answer.`,
        ],
        cta: "See details",
      },
      {
        day: 4,
        subject: brief.earlyStage ? `Want to help shape ${brand.name}?` : `A simple next step with ${brand.name}`,
        preview: brief.earlyStage ? `Share what you need from ${offering}.` : `How to get in touch about ${offering}.`,
        goal: brief.earlyStage ? "Invite early feedback" : "Invite a first conversation",
        paragraphs: brief.earlyStage
          ? [
              `${brand.name} is still early. Your feedback helps us shape ${offering}.`,
              `If you are in our audience (${aud}), reply with what would make this useful for you.`,
            ]
          : [
              `If ${offering} sounds relevant, reply with what you need and we will explain the next step.`,
              `We will not invent prices or promotions in email — those stay with the offer you already defined.`,
            ],
        cta: brief.earlyStage ? "Share feedback" : "Get in touch",
      },
      {
        day: 7,
        subject: `Still thinking it over?`,
        preview: `No urgency — we are here when you are ready.`,
        goal: "Stay available without false urgency",
        paragraphs: [
          `No rush. Comparing options for ${offering} takes time.`,
          `When you have a question, reply to this email. ${brand.name} will be here.`,
        ],
        cta: "Ask a question",
      },
    ],
  };
}

export async function runEmailAgent(ctx: GenerationContext, brand: Brand): Promise<AgentOutput<EmailCampaign>> {
  const brief = copyBrief(ctx);
  const det = deterministicSequence(ctx, brand, brief);
  const buildFromRaw = (raw: typeof det.raw): EmailMessage[] =>
    raw.map((m) => ({
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

  const res = await generateJson({
    system:
      "You are an email marketing expert. Write a welcome/nurture sequence in the brand's voice for this specific business. Never invent customer numbers, reviews, testimonials, results, discounts, gifts, offers, scarcity, deadlines, prices or locations the owner has not stated. Early-stage businesses must not claim an established track record.",
    user: withResearch(
      ctx,
      "email",
      withBrief(
        ctx,
        `${languageInstruction(ctx)}
Return JSON: name, goal, sequence[4-5 of {day (0,2,4,7...), subject (with optional emoji), preview, goal, body (2-3 short paragraphs separated by \\n\\n)}. Each body must be complete and scannable with one clear CTA implied in the last paragraph.
Brand: ${brand.name} — "${brand.slogan}"
Voice: ${brand.voice.join(", ")}
Business: ${ctx.input.idea}
Offering: ${brief.offering}
Audience: ${ctx.input.audience}
Location: ${ctx.input.location || "not provided"}
Stage: ${brief.stage ?? "not provided"}`,
      ),
    ),
    task: "creative",
    temperature: 0.8,
    maxTokens: 1800,
    timeoutMs: 90_000,
    schema: emailLlmSchema,
  });

  // Defense in depth for mocks / edge payloads that skip client-side schema.
  const parsed = emailLlmSchema.safeParse(res.data);
  if (!res.data || !parsed.success) {
    return withLlmTelemetry(
      { data: { name: det.name, goal: det.goal, sequence: buildFromRaw(det.raw) }, source: "deterministic", note: fallbackNote(res.note) },
      res,
    );
  }
  const d = parsed.data;
  const seq = ensureArray(d.sequence, []);
  if (seq.length === 0) {
    return withLlmTelemetry(
      { data: { name: det.name, goal: det.goal, sequence: buildFromRaw(det.raw) }, source: "deterministic", note: "empty-sequence" },
      res,
    );
  }

  const messages: EmailMessage[] = seq.map((m, i) => {
    const subject = nonEmpty(m.subject, det.raw[i]?.subject ?? `Message ${i + 1}`);
    const paragraphs = nonEmpty(m.body, det.raw[i]?.paragraphs.join("\n\n") ?? "").split(/\n\n+/).filter(Boolean);
    const cta = det.raw[i]?.cta ?? "Learn more";
    return {
      day: typeof m.day === "number" ? m.day : det.raw[i]?.day ?? i * 2,
      subject,
      preview: nonEmpty(m.preview, det.raw[i]?.preview ?? ""),
      goal: nonEmpty(m.goal, det.raw[i]?.goal ?? ""),
      bodyHtml: renderEmailHtml(brand, subject, paragraphs.length ? paragraphs : ["..."], cta),
      bodyText: `${subject}\n\n${paragraphs.join("\n\n")}\n\n[${cta}]`,
    };
  });

  return withLlmTelemetry(
    { data: { name: nonEmpty(d.name, det.name), goal: nonEmpty(d.goal, det.goal), sequence: messages }, source: "llm" },
    res,
  );
}
