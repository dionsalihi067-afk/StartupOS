/**
 * Runs once when the server starts. A production server refuses to start
 * without the database and auth configuration; development only warns.
 * Messages list variable names, never values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { missingServerEnv } = await import("@/lib/env");
  const missing = missingServerEnv();
  if (!missing.length) return;
  const message = `Missing or invalid server configuration: ${missing.join(", ")}. See .env.example.`;
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(`[startupos] ${message} Sign-in and saved businesses will not work until it is set.`);
}
