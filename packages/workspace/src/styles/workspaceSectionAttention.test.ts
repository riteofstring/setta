import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSectionAttentionStyles = readFileSync(
  new URL("./workspaceSectionAttention.css", import.meta.url),
  "utf8",
);

describe("workspace section attention styles", () => {
  it("preserves main's blue-purple-pink conic attention border", () => {
    expect(workspaceSectionAttentionStyles).toContain(
      ".setta-workspace-section-attention-active::before",
    );
    expect(workspaceSectionAttentionStyles).toMatch(
      /conic-gradient\([\s\S]*rgb\(59 130 246\)[\s\S]*rgb\(168 85 247\)[\s\S]*rgb\(236 72 153\)[\s\S]*rgb\(59 130 246\)/u,
    );
    expect(workspaceSectionAttentionStyles).toContain("inset: -4px");
    expect(workspaceSectionAttentionStyles).toContain("padding: 4px");
    expect(workspaceSectionAttentionStyles).toContain(
      "setta-workspace-section-attention-spin 2.2s linear infinite",
    );
    expect(workspaceSectionAttentionStyles).toMatch(
      /\.setta-workspace-section-attention-active\s*\{\s*outline-color:\s*transparent/u,
    );
  });

  it("keeps the border visible while removing its animation for reduced motion", () => {
    expect(workspaceSectionAttentionStyles).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.setta-workspace-section-attention-active::before\s*\{[\s\S]*animation:\s*none/u,
    );
  });
});
