import { describe, expect, it } from "vitest";
import { normalizeLocale } from "./locale";

describe("normalizeLocale", () => {
  it("normalizes supported BCP-47 locales", () => {
    expect(normalizeLocale("es-AR")).toBe("es");
    expect(normalizeLocale("en_US")).toBe("en");
  });

  it("rejects unsupported or missing locales", () => {
    expect(normalizeLocale("pt-BR")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
  });
});
