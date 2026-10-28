const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemma3:1b",
    messages: [{ role: "user", content: 'Reply with JSON only: {"ok":true}' }],
    stream: false,
    response_format: { type: "json_object" },
    temperature: 0,
  }),
});
const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 800));
process.exit(res.ok ? 0 : 1);
