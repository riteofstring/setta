import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceStyles = readFileSync(new URL("./workspace.css", import.meta.url), "utf8");

describe("workspace adaptive stylesheet contract", () => {
  it("opts package motion in and neutralizes retained inline sortable motion", () => {
    expect(workspaceStyles).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(workspaceStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(workspaceStyles).toContain("[data-sortable-section-id]");
    expect(workspaceStyles).toContain("transition-duration: 0.01ms !important");
  });

  it("enlarges coarse-pointer hit geometry without enlarging compact paint", () => {
    expect(workspaceStyles).toContain("@media (pointer: coarse)");
    expect(workspaceStyles).toContain('[data-setta-workspace-touch-target="compact"]::after');
    expect(workspaceStyles).toContain("inline-size: 1.5rem");
    expect(workspaceStyles).toContain("inline-size: 2.75rem");
    expect(workspaceStyles).not.toMatch(
      /data-setta-workspace-touch-target="compact"[^}]*min-inline-size/su,
    );
  });

  it("keeps the fixed-size minimap inside a narrow canvas without changing its ratio", () => {
    expect(workspaceStyles).toContain("width: min(200px, max(0px, calc(100% - 30px)))");
    expect(workspaceStyles).toContain("aspect-ratio: 4 / 3");
    expect(workspaceStyles).toContain(".react-flow__minimap > svg");
  });

  it("keeps shell motion bounded and maps pane chrome to logical edges", () => {
    expect(workspaceStyles).toContain('.setta-workspace-shell-pane[data-pane="leading"]');
    expect(workspaceStyles).toContain("inset-inline-start: 0");
    expect(workspaceStyles).toContain("inset-inline-end: 0");
    expect(workspaceStyles).toContain(':dir(rtl)[data-visible="false"]');
    expect(workspaceStyles).toContain("transition-property: transform");
    expect(workspaceStyles).not.toContain("transition: all");
    expect(workspaceStyles).toMatch(/\.setta-workspace-shell-resize-handle\s*\{[^}]*width: 10px/su);
    expect(workspaceStyles).not.toContain(".setta-workspace-shell-resize-handle::before");
  });

  it("keeps Outline paint compact inside logical, visible-focus tree geometry", () => {
    expect(workspaceStyles).toMatch(/\.setta-workspace-outline-item\s*\{[^}]*min-height: 24px/su);
    expect(workspaceStyles).toMatch(/\.setta-workspace-outline-row\s*\{[^}]*height: 20px/su);
    expect(workspaceStyles).toContain("margin-inline-start: var(--setta-workspace-outline-depth)");
    expect(workspaceStyles).toContain(
      ".setta-workspace-outline-item:focus-visible .setta-workspace-outline-row",
    );
    expect(workspaceStyles).toContain("@media (forced-colors: active)");
    expect(workspaceStyles).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)[^{]*\{[^}]*\.setta-workspace-outline-disclosure svg/su,
    );
  });
});
