import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ReactFlow from "./ReactFlow";

vi.mock("components/Section/Container/SectionContainerBoundary", () => ({
  SectionContainerBoundary: ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-section-container-boundary"
      data-section-id={sectionId}
    />
  ),
}));

vi.mock("components/Pages/Project/settingsAllSettingsBenchmark", () => ({
  useSettingsAllSettingsBenchmark: () => ({
    active: false,
    stage: "off",
  }),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: (
    selector: (state: {
      snapToGrid: boolean;
      showAgenticEdges: boolean;
      showArgEdges: boolean;
      darkMode: boolean;
      overviewTrueWidth: number;
      uiEditorTrueWidth: number;
    }) => unknown,
  ) =>
    selector({
      snapToGrid: false,
      showAgenticEdges: true,
      showArgEdges: true,
      darkMode: false,
      overviewTrueWidth: 0,
      uiEditorTrueWidth: 0,
    }),
  useSettings: (
    selector: (state: {
      gui: {
        showGridLines: boolean;
        wireColor: string;
        wireColorDarkMode: string;
      };
    }) => unknown,
  ) =>
    selector({
      gui: {
        showGridLines: false,
        wireColor: "#123456",
        wireColorDarkMode: "#abcdef",
      },
    }),
}));

vi.mock("utils/focusManager", () => ({
  useTabScope: () => {},
}));

vi.mock("../store", () => ({
  useReactFlow: (
    selector: (state: { connectionStartHandle: unknown }) => unknown,
  ) => selector({ connectionStartHandle: null }),
}));

vi.mock("./reactFlowView", () => ({
  REACT_FLOW_SCROLL_INIT: 1000,
  buildReactFlowScrollPlan: () => null,
  buildReactFlowStoreDimensions: () => ({
    width: 600,
    height: 400,
  }),
  resolveReactFlowWireColor: () => "#123456",
  shouldRenderReactFlowContents: () => true,
}));

vi.mock("./FlowRenderer", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-flow-renderer">{children}</div>
  ),
}));

vi.mock("./Viewport", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-viewport-wrapper">{children}</div>
  ),
}));

vi.mock("./EdgeRenderer", () => ({
  default: () => <div data-testid="mock-edge-renderer" />,
}));

vi.mock("./AgenticEdgeRenderer", () => ({
  default: () => <div data-testid="mock-agentic-edge-renderer" />,
}));

vi.mock("./StateMachineEdgeRenderer", () => ({
  default: () => <div data-testid="mock-state-machine-edge-renderer" />,
}));

vi.mock("./NodeRenderer", () => ({
  default: ({
    SectionBoundary,
  }: {
    SectionBoundary: ({ sectionId }: { sectionId: string }) => ReactNode;
  }) => (
    <div data-testid="mock-node-renderer">
      <SectionBoundary sectionId="section-a" />
    </div>
  ),
}));

vi.mock("forks/xyflow/background/Background", () => ({
  default: () => <div data-testid="mock-background" />,
}));

describe("ReactFlow", () => {
  it("owns the top-level section boundary above NodeRenderer", () => {
    const markup = renderToStaticMarkup(<ReactFlow />);

    expect(markup).toContain('data-testid="mock-flow-renderer"');
    expect(markup).toContain('data-testid="mock-viewport-wrapper"');
    expect(markup).toContain('data-testid="mock-node-renderer"');
    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="section-a"');
  });
});
