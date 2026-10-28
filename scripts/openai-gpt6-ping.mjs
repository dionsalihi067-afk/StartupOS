/**
 * Bounded live check that GPT-6 Chat Completions accept max_completion_tokens.
 * Prints status/model/tokens only — never the API key.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const key = (process.env.OPENAI_API_KEY ?? "").trim();
if (!key.startsWith("sk-") || key.length < 20) {
  console.log("skip=no-real-openai-key");
  process.exit(0);
}

const attempts = [
  { model: "gpt-6.1-sol", reasoning_effort: "low", max_completion_tokens: 120 },
  { model: "gpt-6-luna", reasoning_effort: "none", max_completion_tokens: 80 },
  { model: "gpt-6-astra", reasoning_effort: "low", max_completion_tokens: 120 },
];

let anyOk = false;
for (const attempt of attempts) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: attempt.model,
      max_completion_tokens: attempt.max_completion_tokens,
      response_format: { type: "json_object" },
      reasoning_effort: attempt.reasoning_effort,
      messages: [{ role: "user", content: 'Reply with JSON {"ok":true}' }],
    }),
  });
  const body = await res.json().catch(() => null);
  let parsed = false;
  try {
    parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "").ok === true;
  } catch {
    /* ignore */
  }
  console.log(
    `gpt6Ping status=${res.status} code=${body?.error?.code ?? body?.error?.type ?? "-"} requestedModel=${attempt.model} effort=${attempt.reasoning_effort} servedModel=${body?.model ?? "-"} parsedOk=${parsed} tokens=${body?.usage?.total_tokens ?? "-"}`,
  );
  if (res.ok && parsed) anyOk = true;
}
process.exit(anyOk ? 0 : 1);
