import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceStyles = readFileSync(
  new URL("./index.css", import.meta.url),
  "utf8",
).replace(/^@import "(\.\/[^"]+)";$/gmu, (_statement, relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8"),
);
const itemToolbarStyles = readFileSync(
  new URL("./itemToolbar.css", import.meta.url),
  "utf8",
);
const sectionFieldStyles = readFileSync(
  new URL("./sectionField.css", import.meta.url),
  "utf8",
);
const generatedDocumentStyles = readFileSync(
  new URL("./generatedDocument.css", import.meta.url),
  "utf8",
);
const focusVisibilityStyles = readFileSync(
  new URL("./workspaceFocusVisibility.css", import.meta.url),
  "utf8",
);
const interactionPolicyStyles = readFileSync(
  new URL("./workspaceInteractionPolicy.css", import.meta.url),
  "utf8",
);

describe("workspace adaptive stylesheet contract", () => {
  it("opts package motion in and neutralizes retained inline sortable motion", () => {
    expect(workspaceStyles).toContain(
      "@media (prefers-reduced-motion: no-preference)",
    );
    expect(workspaceStyles).toContain(
      "@media (prefers-reduced-motion: reduce)",
    );
    expect(workspaceStyles).toContain("[data-sortable-section-id]");
    expect(workspaceStyles).toContain("transition-duration: 0.01ms !important");
  });

  it("enlarges coarse-pointer hit geometry without enlarging compact paint", () => {
    expect(workspaceStyles).toContain("@media (pointer: coarse)");
    expect(workspaceStyles).toContain(
      '[data-setta-workspace-touch-target="compact"]::after',
    );
    expect(workspaceStyles).toContain("inline-size: 1.5rem");
    expect(workspaceStyles).toContain("inline-size: 2.75rem");
    expect(workspaceStyles).not.toMatch(
      /data-setta-workspace-touch-target="compact"[^}]*min-inline-size/su,
    );
  });

  it("keeps the fixed-size minimap inside a narrow canvas without changing its ratio", () => {
    expect(workspaceStyles).toContain(
      "width: min(200px, max(0px, calc(100% - 30px)))",
    );
    expect(workspaceStyles).toContain("aspect-ratio: 4 / 3");
    expect(workspaceStyles).toContain(".react-flow__minimap > svg");
  });

  it("contains bounded-group overscroll before Chromium can claim browser history", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-bounded-group-scroll\s*\{[^}]*overscroll-behavior: contain/su,
    );
  });

  it("contains native floating-window scrollports before Chromium can claim browser history", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-window-manager-window\s+\.nowheel,\s*\.setta-workspace-window-manager-window\s+\.setta-native-wheel-y\s*\{[^}]*overscroll-behavior:\s*contain/su,
    );
  });

  it("contains the native scrollport inside a body-portaled dropdown menu", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-dropdown-scrollport\s*\{[^}]*overscroll-behavior:\s*contain/su,
    );
  });

  it("preserves outward selection paint inside bounded group scrollports", () => {
    expect(interactionPolicyStyles).toMatch(
      /\.setta-workspace-bounded-group-scroll\s*\{[^}]*margin-block-start: 4px;[^}]*margin-block-end: -4px;[^}]*margin-inline: -4px;[^}]*padding: 4px;/su,
    );
    expect(interactionPolicyStyles).not.toContain("inset 0 0 0 4px");
  });

  it("drives press feedback from only the deepest inactive group shell", () => {
    expect(interactionPolicyStyles).toMatch(
      /\[data-group-overflow-mode\]:active:not\([^)]*:has\([^)]*button:active,[^)]*:active\.setta-prevent-section-active-css,[^)]*\[data-group-overflow-mode\]:active,[^)]*\[data-section-id\]:active[^)]*\)[^)]*\)\s*> \[data-workspace-group-selection-outline="true"\]\[data-section-active="false"\]\s*\{[^}]*outline-color: rgb\(103 232 249\)/su,
    );
  });

  it("promotes only section shells so port centering survives viewport gestures", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace\.react-flow\[data-viewport-interaction-active="true"\]\s+\[data-workspace-section-shell="true"\][^{]*\{[^}]*will-change: transform[^}]*transform: translateZ\(0\)[^}]*backface-visibility: hidden[^}]*isolation: isolate/su,
    );
    expect(workspaceStyles).not.toMatch(
      /data-viewport-interaction-active="true"\]\s+\[data-section-id\]/su,
    );

    expect(workspaceStyles).not.toContain(
      ".react-flow:hover [data-section-id]",
    );
    expect(workspaceStyles).not.toMatch(
      /@media \(hover: none\)[^{]*\{[^}]*\[data-section-id\]/su,
    );
    expect(workspaceStyles.match(/will-change: transform/gu)?.length ?? 0).toBe(
      1,
    );
  });

  it("keeps shell motion bounded and maps pane chrome to logical edges", () => {
    expect(workspaceStyles).toContain(
      '.setta-workspace-shell-pane[data-pane="leading"]',
    );
    expect(workspaceStyles).toContain("inset-inline-start: 0");
    expect(workspaceStyles).toContain("inset-inline-end: 0");
    expect(workspaceStyles).toMatch(
      /:dir\(\s*rtl\s*\)\[data-visible="false"\]/u,
    );
    expect(workspaceStyles).toContain("transition-property: transform");
    expect(workspaceStyles).not.toContain("transition: all");
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-shell-resize-handle\s*\{[^}]*width: 10px/su,
    );
    expect(workspaceStyles).not.toContain(
      ".setta-workspace-shell-resize-handle::before",
    );
    expect(interactionPolicyStyles).toMatch(
      /\.setta-workspace-shell-pane-region\s*\{[^}]*position: absolute/su,
    );
    expect(interactionPolicyStyles).toMatch(
      /\.setta-workspace-shell-center\s*\{[^}]*width: 100%;[^}]*height: 100%/su,
    );
  });

  it("keeps Outline paint compact inside logical, visible-focus tree geometry", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-outline-item\s*\{[^}]*min-height: 24px/su,
    );
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-outline-row\s*\{[^}]*height: 20px/su,
    );
    expect(workspaceStyles).toContain(
      "margin-inline-start: var(--setta-workspace-outline-depth)",
    );
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

  it("keeps pane focus paint suppressed without affecting section selection paint", () => {
    expect(focusVisibilityStyles).not.toContain(
      '.setta-workspace:not([data-workspace-keyboard-focus="true"]) :focus',
    );
    expect(focusVisibilityStyles).toMatch(
      /\.setta-workspace \.react-flow__pane:focus,[\s\S]*\.setta-workspace \.react-flow__pane:focus-visible\s*\{[^}]*outline: none/su,
    );
    expect(focusVisibilityStyles).not.toContain(
      '[data-workspace-keyboard-focus="true"] .react-flow__pane:focus',
    );
  });

  it("gates large shell and minimap focus paint on actual keyboard focus movement", () => {
    expect(interactionPolicyStyles).toMatch(
      /\.react-flow__minimap svg:focus,[^{]*\{[^}]*outline: none/su,
    );
    expect(interactionPolicyStyles).toMatch(
      /\[data-workspace-keyboard-focus="true"\] \.react-flow__minimap svg:focus\s*\{[^}]*outline: 2px solid/su,
    );
    expect(interactionPolicyStyles).toMatch(
      /\.setta-workspace-shell-resize-handle:focus[^}]*\{[^}]*outline: none/su,
    );
    expect(interactionPolicyStyles).toMatch(
      /\[data-workspace-keyboard-focus="true"\]\s+\.setta-workspace-shell-resize-handle:focus::after\s*\{[^}]*background-color: rgb\(59 130 246\)/su,
    );
    expect(workspaceStyles).toContain(
      '.setta-workspace-navigator-trigger[data-workspace-keyboard-focus="true"]:focus',
    );
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-navigator-trigger:focus\s*\{[^}]*outline: none/su,
    );
    expect(workspaceStyles).not.toContain(
      ".setta-workspace-navigator-trigger:focus-visible",
    );
  });

  it("matches the reference selection surface without a second browser focus outline", () => {
    expect(focusVisibilityStyles).toMatch(
      /\.react-flow__nodesselection-rect:focus,[\s\S]*\.react-flow__selection:focus-visible\s*\{[^}]*outline: none/su,
    );
  });

  it("uses the compact filter underline without Chromium's redundant rounded outline", () => {
    expect(itemToolbarStyles).toMatch(
      /\.setta-workspace-item-filter-input:focus-visible\s*\{[^}]*outline: none/su,
    );
    expect(itemToolbarStyles).toMatch(
      /@media \(forced-colors: active\)[^{]*\{[^}]*\.setta-workspace-item-filter-input:focus-visible[^}]*outline: 1px solid Highlight/su,
    );
  });

  it("keeps the section field's focus cue visible once forced colours drop its border", () => {
    expect(sectionFieldStyles).toMatch(
      /\.setta-workspace-section-field-editor-live \*\s*\{[^}]*outline: 0/su,
    );
    expect(sectionFieldStyles).toMatch(
      /@media \(forced-colors: active\)[^{]*\{[^}]*\.setta-workspace-section-field:focus-within[^}]*outline: 1px solid Highlight/su,
    );
  });

  it("keeps a generated document legible once forced colours drop its region", () => {
    expect(generatedDocumentStyles).toMatch(
      /@media \(forced-colors: active\)[^{]*\{[^}]*\.setta-workspace-generated-document[^}]*border-inline-start: 3px solid CanvasText/su,
    );

    expect(generatedDocumentStyles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*::after\s*\{[^}]*border: 1px solid CanvasText/u,
    );
  });

  it("keeps portaled menus compact, bounded, scoped, and keyboard-visible", () => {
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-menu\s*\{[^}]*width: clamp\(5rem, 20vw, 10rem\)/su,
    );
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-menu\s*\{[^}]*max-height: 40vh/su,
    );
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-menu-item\s*\{[^}]*min-height: 24px/su,
    );
    expect(workspaceStyles).toMatch(
      /\.setta-workspace-menu-item::before\s*\{[^}]*height: 20\.8px/su,
    );
    expect(workspaceStyles).toContain(
      ".setta-workspace-menu-item:focus-visible",
    );
    expect(workspaceStyles).toContain("padding-inline: 20px 0");
    expect(workspaceStyles).not.toMatch(
      /\.setta-workspace-menu[^}]*transition/su,
    );
  });
});
