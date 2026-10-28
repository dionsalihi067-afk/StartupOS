import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/utils";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("parses markdown-fenced JSON", () => {
    expect(extractJson('Here you go:\n```json\n{"ok":true}\n```\nThanks')).toEqual({ ok: true });
    expect(extractJson("```\n{\"n\":2}\n```")).toEqual({ n: 2 });
  });

  it("extracts an object surrounded by prose", () => {
    expect(extractJson('Sure. {"name":"Drita","tiers":[]} is the plan.')).toEqual({ name: "Drita", tiers: [] });
  });

  it("repairs trailing commas common in LLM JSON", () => {
    expect(extractJson('{"a":1,}')).toEqual({ a: 1 });
    expect(extractJson('{"items":[1,2,],}')).toEqual({ items: [1, 2] });
  });

  it("returns null for empty, whitespace, or non-JSON text", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson("   \n\t")).toBeNull();
    expect(extractJson("Sorry, I cannot help with that.")).toBeNull();
  });

  it("parses JSON primitives and arrays (callers must still reject non-objects)", () => {
    expect(extractJson("null")).toBeNull(); // indistinguishable from failure at this layer
    expect(extractJson("42")).toBe(42);
    expect(extractJson('"hello"')).toBe("hello");
    expect(extractJson("[1,2]")).toEqual([1, 2]);
  });

  it("returns null for incomplete objects", () => {
    expect(extractJson('{"a":1')).toBeNull();
    expect(extractJson("{")).toBeNull();
  });

  it("does not throw on incomplete string values", () => {
    expect(() => extractJson('{"a":"unterminated')).not.toThrow();
    expect(extractJson('{"a":"unterminated')).toBeNull();
  });
});
