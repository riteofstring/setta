import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceGraphStyles = readFileSync(
  new URL("./workspaceGraph.css", import.meta.url),
  "utf8",
);

describe("workspace graph stylesheet contract", () => {
  it("keeps data edges on main's default and selected treatment", () => {
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-edge--data\s+\.setta-workspace-graph-edge-path\s*\{[^}]*stroke: var\(--setta-wire-color, #b1b1b7\);[^}]*stroke-width: 1;/su,
    );
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-edge--data\.setta-workspace-graph-edge--selected\s+\.setta-workspace-graph-edge-path\s*\{[^}]*stroke: #3b82f6;[^}]*\}/su,
    );
  });

  it("keeps agentic and workflow edge tokens aligned with main", () => {
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-edge--agentic\s+\.setta-workspace-graph-edge-path\s*\{[^}]*stroke: #60a5fa;[^}]*stroke-width: 1\.7;[^}]*stroke-dasharray: 7 5;/su,
    );
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-edge--workflow\s+\.setta-workspace-graph-edge-path\s*\{[^}]*stroke: #f59e0b;[^}]*stroke-width: 2\.2;/su,
    );
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace\.setta-workspace-dark\s+\.setta-workspace-graph-edge--workflow\.setta-workspace-graph-edge--selected\s+\.setta-workspace-graph-edge-path\s*\{[^}]*stroke: #fb923c;[^}]*drop-shadow\(0 0 5px rgb\(251 146 60 \/ 0\.28\)\)/su,
    );
    expect(workspaceGraphStyles).not.toMatch(
      /setta-workspace-graph-edge--(?:agentic|workflow):(?:hover|focus)/u,
    );
  });

  it("uses main's neutral solid connection preview", () => {
    const previewBlock = workspaceGraphStyles.match(
      /\.setta-workspace-graph-connection-preview\s*\{[^}]*\}/su,
    )?.[0];
    expect(previewBlock).toContain("stroke: var(--setta-wire-color, #b1b1b7)");
    expect(previewBlock).toContain("stroke-width: 1");
    expect(previewBlock).not.toContain("stroke-dasharray");
    expect(previewBlock).not.toContain("filter");
  });

  it("uses main's port dimensions, spacing, fade cadence, and theme colors", () => {
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-render-size: 10px",
    );
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-side-offset: -6px",
    );
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-render-size: 14px",
    );
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-safe-height: 42px",
    );
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-safe-width: 32px",
    );
    expect(workspaceGraphStyles).toContain("transition: opacity 80ms ease-out");
    expect(workspaceGraphStyles).toContain("transition-duration: 70ms");
    expect(workspaceGraphStyles).toContain("z-index: 40");
    expect(workspaceGraphStyles).toContain("z-index: 160");
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-port--workflow\s*\{[^}]*--setta-workspace-graph-port-color: #d97706;/su,
    );
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace\.setta-workspace-dark\s+\.setta-workspace-graph-port--workflow\s*\{[^}]*--setta-workspace-graph-port-color: #f59e0b;/su,
    );
  });

  it("keeps source ports filled, target ports hollow, and only specialized disabled ports subdued", () => {
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-port--source\s+\.setta-workspace-graph-port-dot\s*\{[^}]*border-width: 0;[^}]*background: var\(--setta-workspace-graph-port-color\);/su,
    );
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-port--target\s+\.setta-workspace-graph-port-dot\s*\{[^}]*border-width: 2px;[^}]*background: transparent;/su,
    );
    expect(workspaceGraphStyles).not.toMatch(
      /\.setta-workspace-graph-port--data\.setta-workspace-graph-port--disabled\s*\{[^}]*opacity/su,
    );
    expect(workspaceGraphStyles).not.toContain(
      ".setta-workspace-graph-port-safe-zone--disabled",
    );
  });

  it("uses main's themed port variables and data-port color transitions", () => {
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-color: var(--setta-section-style-arg-handle)",
    );
    expect(workspaceGraphStyles).toContain(
      "--setta-workspace-graph-port-color: var(\n    --setta-section-style-agentic-handle\n  )",
    );
    expect(workspaceGraphStyles).toContain("background-color 80ms ease-out");
    expect(workspaceGraphStyles).not.toContain(
      ".setta-workspace-graph-port--candidate-valid\n  .setta-workspace-graph-port-dot",
    );
    expect(workspaceGraphStyles).not.toContain(
      ".setta-workspace-graph-port--candidate-invalid\n  .setta-workspace-graph-port-dot",
    );
  });
});
