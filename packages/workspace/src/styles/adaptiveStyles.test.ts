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
});
