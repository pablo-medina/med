import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultPageLayout,
  isValidPageLayout,
  loadPageLayout,
  marginPresetFor,
  pageDimensionsMm,
  savePageLayout,
} from "./pageLayout";

describe("page layout", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it("swaps paper dimensions in landscape orientation", () => {
    expect(pageDimensionsMm({ ...defaultPageLayout, orientation: "landscape" }))
      .toEqual({ width: 297, height: 210 });
  });

  it("rejects margins that leave no usable document area", () => {
    expect(isValidPageLayout({
      ...defaultPageLayout,
      margins: { top: 20, right: 60, bottom: 20, left: 60 },
      paperSize: "a5",
    })).toBe(false);
  });

  it("persists a valid layout and recognizes custom margins", () => {
    const layout = {
      ...defaultPageLayout,
      margins: { top: 18, right: 21, bottom: 18, left: 21 },
    };
    savePageLayout(layout);
    expect(loadPageLayout()).toEqual(layout);
    expect(marginPresetFor(layout.margins)).toBe("custom");
  });

  it("migrates layouts saved before document fonts were configurable", () => {
    localStorage.setItem("med.pageLayout", JSON.stringify({
      paperSize: "letter",
      orientation: "landscape",
      margins: { top: 15, right: 16, bottom: 17, left: 18 },
    }));

    expect(loadPageLayout()).toEqual({
      paperSize: "letter",
      orientation: "landscape",
      fontFamily: "georgia",
      margins: { top: 15, right: 16, bottom: 17, left: 18 },
    });
  });
});
