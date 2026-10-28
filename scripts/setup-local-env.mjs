// Development only: fills in the server configuration `npm run dev` needs, in the
// git-ignored .env.local. Existing values are never changed and no value is printed.
// The database URL points at `npm run db:local`; the auth secret is freshly generated.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.resolve(".env.local");
const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const defaults = {
  DATABASE_URL: `postgres://postgres:postgres@localhost:${port}/startupos`,
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: "http://localhost:3000",
};

const original = existsSync(file) ? readFileSync(file, "utf8") : "";
const lines = original === "" ? [] : original.split(/\r?\n/);
const added = [];

for (const [key, value] of Object.entries(defaults)) {
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
  if (index >= 0) {
    const current = lines[index].slice(lines[index].indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    if (current !== "") continue;
    lines[index] = `${key}=${value}`;
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(`${key}=${value}`);
  }
  added.push(key);
}

if (added.length === 0) {
  console.log(".env.local already sets DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL; nothing changed.");
} else {
  writeFileSync(file, `${lines.join("\n").replace(/\n*$/, "")}\n`, { mode: 0o600 });
  console.log(`.env.local: added ${added.join(", ")} (values not shown).`);
  console.log("Next: npm run db:local (separate terminal), npm run db:migrate, then npm run dev.");
}
