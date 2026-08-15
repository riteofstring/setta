import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceStyles = readFileSync(new URL("./workspace.css", import.meta.url), "utf8");
const focusVisibilityStyles = readFileSync(
  new URL("./workspaceFocusVisibility.css", import.meta.url),
  "utf8",
);

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

  it("contains bounded-group overscroll before Chromium can claim browser history", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-bounded-group-scroll\s*\{[^}]*overscroll-behavior: contain/su,
    );
  });

  it("prepares section compositor layers before pan starts without a per-section state fanout", () => {
    expect(workspaceStyles).toContain(".setta-workspace.react-flow:hover [data-section-id]");
    expect(workspaceStyles).toContain(
      '.setta-workspace.react-flow[data-viewport-interaction-active="true"] [data-section-id]',
    );
    expect(workspaceStyles).toMatch(
      /\.setta-workspace\.react-flow:hover \[data-section-id\][^{]*\{[^}]*will-change: transform[^}]*transform: translateZ\(0\)[^}]*backface-visibility: hidden[^}]*isolation: isolate/su,
    );
    expect(workspaceStyles).toMatch(
      /@media \(hover: none\)[^{]*\{[^}]*\.setta-workspace\.react-flow \[data-section-id\]/su,
    );
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
    expect(focusVisibilityStyles).toMatch(
      /\.setta-workspace-outline:focus-visible\s*\{[^}]*outline: none/su,
    );
    expect(focusVisibilityStyles).toContain(
      '[data-workspace-keyboard-focus="true"] .setta-workspace-outline:focus',
    );
    expect(workspaceStyles).toContain("@media (forced-colors: active)");
    expect(workspaceStyles).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)[^{]*\{[^}]*\.setta-workspace-outline-disclosure svg/su,
    );
  });

  it("keeps modifier-only keys from exposing the full canvas focus surface", () => {
    expect(focusVisibilityStyles).toMatch(
      /\.setta-workspace \.react-flow__pane:focus-visible\s*\{[^}]*outline: none/su,
    );
    expect(focusVisibilityStyles).toContain(
      '[data-workspace-keyboard-focus="true"] .react-flow__pane:focus',
    );
  });

  it("keeps portaled menus compact, bounded, scoped, and keyboard-visible", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-menu\s*\{[^}]*width: clamp\(5rem, 20vw, 10rem\)/su,
    );
    expect(workspaceStyles).toMatch(/\.setta-workspace-menu\s*\{[^}]*max-height: 40vh/su);
    expect(workspaceStyles).toMatch(/\.setta-workspace-menu-item\s*\{[^}]*min-height: 24px/su);
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-menu-item::before\s*\{[^}]*height: 20\.8px/su,
    );
    expect(workspaceStyles).toContain(".setta-workspace-menu-item:focus-visible");
    expect(workspaceStyles).toContain("padding-inline: 20px 0");
    expect(workspaceStyles).not.toMatch(/\.setta-workspace-menu[^}]*transition/su);
  });
});
