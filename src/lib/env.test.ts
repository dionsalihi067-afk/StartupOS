import { describe, expect, it } from "vitest";
import { missingServerEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/startupos",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("missingServerEnv", () => {
  it("accepts a complete development configuration without optional origins", () => {
    expect(missingServerEnv(env({ ...valid, NODE_ENV: "development" }))).toEqual([]);
  });

  it("lists unset required variables by name only", () => {
    const missing = missingServerEnv(env({ NODE_ENV: "development" }));
    expect(missing.sort()).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL"]);
  });

  it("reports an invalid optional APP_ORIGIN instead of failing later on every request", () => {
    const missing = missingServerEnv(env({ ...valid, NODE_ENV: "development", APP_ORIGIN: "app.example.com" }));
    expect(missing).toEqual(["APP_ORIGIN"]);
  });

  it("requires BETTER_AUTH_URL in production", () => {
    expect(missingServerEnv(env({ ...valid, NODE_ENV: "production" }))).toEqual(["BETTER_AUTH_URL"]);
    expect(missingServerEnv(env({ ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://app.example.com" }))).toEqual([]);
  });

  it("never includes configured values in its output", () => {
    const output = missingServerEnv(env({ ...valid, NODE_ENV: "production", BETTER_AUTH_SECRET: "short-secret" })).join(",");
    expect(output).not.toContain("short-secret");
    expect(output).not.toContain("pass@");
  });
});
