import type { SectionDefinition } from "@setta/workspace/react";

const navigationGroupDefinition = {
  canContainSections: true,
  defaultChildOrientation: "vertical",
  defaultChildOverflow: "grow",
  defaultSize: { height: 360, width: 480 },
  defaultSizeMode: { height: "content", width: "fixed" },
  defaultTitle: "Section group",
  displayName: "Section group",
  kind: "navigation group",
  render: () => (
    <p className="canvas-shell-section-content">
      Grouped sections retain their identities and canonical order. Use Selection actions to ungroup
      them.
    </p>
  ),
  resize: {
    axes: "both",
    maxSize: { height: 1_600, width: 720 },
    minSize: { height: 180, width: 220 },
    preserveAspectRatio: false,
  },
} satisfies SectionDefinition;

export const canvasShellSectionDefinitions = [
  {
    contentSizing: { height: true, width: true },
    defaultSize: { height: 180, width: 240 },
    displayName: "Navigation fixture",
    kind: "navigation fixture",
    render: ({ sectionId }) => (
      <p className="canvas-shell-section-content">Measured host renderer for {sectionId}.</p>
    ),
    resize: {
      axes: "both",
      maxSize: { height: 360, width: 480 },
      minSize: { height: 144, width: 192 },
      preserveAspectRatio: false,
    },
  },
  navigationGroupDefinition,
  {
    ...navigationGroupDefinition,
    kind: "navigation collapsing group",
    minimizeScope: "subtree",
  },
] satisfies readonly SectionDefinition[];
