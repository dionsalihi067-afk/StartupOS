/**
 * Bounded live check: load .env.local, resolve OpenAI-primary provider, one tiny chat call.
 * Prints status/model/tokens only — never the API key.
 * Usage: node scripts/openai-primary-ping.mjs
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

function looksLikeOpenAiSecret(apiKey) {
  const k = (apiKey ?? "").trim();
  return k.startsWith("sk-") && k.length >= 20;
}

function isLocalOllamaBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `http://${baseUrl}`);
    const host = u.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return port === "11434" || baseUrl.includes("11434");
  } catch {
    return false;
  }
}

const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
const explicitBase = (process.env.OPENAI_BASE_URL ?? "").trim();
const preference = (process.env.LLM_PROVIDER ?? "auto").trim().toLowerCase() || "auto";
const hasRealOpenAi = looksLikeOpenAiSecret(openaiKey);
const ignoredLocal = hasRealOpenAi && explicitBase && isLocalOllamaBaseUrl(explicitBase);

console.log(
  JSON.stringify({
    preference,
    hasRealOpenAiKey: hasRealOpenAi,
    explicitBaseIsLocal: explicitBase ? isLocalOllamaBaseUrl(explicitBase) : false,
    wouldPreferOpenAiOverLocal: Boolean(ignoredLocal),
    modelEnv: process.env.OPENAI_MODEL || "(default)",
  }),
);

if (!hasRealOpenAi) {
  console.log("skip=no-real-openai-key");
  process.exit(0);
}

const baseUrl = "https://api.openai.com/v1";
const rawModel = process.env.OPENAI_MODEL?.trim() || "";
const model =
  !rawModel || rawModel.includes(":") || /^(gemma|llama|qwen|mistral)/i.test(rawModel)
    ? "gpt-4o-mini"
    : rawModel;
const res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${openaiKey}`,
  },
  body: JSON.stringify({
    model,
    max_tokens: 16,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: 'Reply with JSON {"ok":true}' }],
  }),
});
const body = await res.json().catch(() => null);
const code = body?.error?.code ?? body?.error?.type ?? null;
let parsed = false;
try {
  parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "").ok === true;
} catch {
  /* ignore */
}
console.log(
  `livePing status=${res.status} code=${code ?? "-"} requestedModel=${model} servedModel=${body?.model ?? "-"} parsedOk=${parsed} tokens=${body?.usage?.total_tokens ?? "-"}`,
);
process.exit(res.ok && parsed ? 0 : 1);
