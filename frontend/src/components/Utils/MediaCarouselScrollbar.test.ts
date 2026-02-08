import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MediaCarousel scrollbar CSS", () => {
  it("does not hide the carousel thumbnail strip scrollbar", () => {
    const cssPath = path.resolve(__dirname, "../../../index.css");
    const css = readFileSync(cssPath, "utf-8");

    // This is a UX requirement: the carousel thumbnail strip must keep a visible horizontal
    // scrollbar on platforms that show scrollbars by default (e.g., Windows).
    expect(css).not.toMatch(
      /\.setta-media-carousel-thumbnail-row\s*{[^}]*scrollbar-width:\s*none/i,
    );
    expect(css).not.toMatch(
      /\.setta-media-carousel-thumbnail-row::\-webkit-scrollbar\s*{[^}]*height:\s*0/i,
    );
    expect(css).not.toMatch(
      /\.setta-media-carousel-thumbnail-row::\-webkit-scrollbar\s*{[^}]*width:\s*0/i,
    );
  });
});
