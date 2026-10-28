import { describe, expect, it } from "vitest";
import { APP_HOME, isAppPath, safeNextPath } from "@/lib/routing";

describe("safeNextPath", () => {
  it("allows in-app dashboard destinations", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/dashboard/projects")).toBe("/dashboard/projects");
    expect(safeNextPath("/dashboard/projects/biz_abc?tab=1")).toBe("/dashboard/projects/biz_abc?tab=1");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe(APP_HOME);
    expect(safeNextPath("//evil.example")).toBe(APP_HOME);
    expect(safeNextPath("/\\evil.example")).toBe(APP_HOME);
    expect(safeNextPath("/dashboard/@evil.example")).toBe(APP_HOME);
  });

  it("rejects path traversal that escapes the dashboard prefix", () => {
    expect(safeNextPath("/dashboard/../login")).toBe(APP_HOME);
    expect(safeNextPath("/dashboard/../../etc/passwd")).toBe(APP_HOME);
    expect(safeNextPath("/dashboard/%2e%2e/login")).toBe(APP_HOME);
    expect(safeNextPath("/dashboard/%2E%2E/%2e%2e/login")).toBe(APP_HOME);
    expect(safeNextPath("/dashboard/projects/../../../login")).toBe(APP_HOME);
  });

  it("normalizes harmless in-app relative segments", () => {
    expect(safeNextPath("/dashboard/projects/../settings")).toBe("/dashboard/settings");
    expect(safeNextPath("/dashboard/./projects")).toBe("/dashboard/projects");
  });

  it("rejects non-dashboard app paths and junk", () => {
    expect(safeNextPath("/login")).toBe(APP_HOME);
    expect(safeNextPath("/")).toBe(APP_HOME);
    expect(safeNextPath("")).toBe(APP_HOME);
    expect(safeNextPath(null)).toBe(APP_HOME);
    expect(safeNextPath("/dashboard/" + "x".repeat(500))).toBe(APP_HOME);
    expect(safeNextPath("/%2f%2fevil.example")).toBe(APP_HOME);
  });
});

describe("isAppPath", () => {
  it("matches only the dashboard tree", () => {
    expect(isAppPath("/dashboard")).toBe(true);
    expect(isAppPath("/dashboard/x")).toBe(true);
    expect(isAppPath("/dash")).toBe(false);
    expect(isAppPath("/login")).toBe(false);
  });
});
