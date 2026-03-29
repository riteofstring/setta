import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UIPage } from "./UiPage";

vi.mock("forks/dnd-kit/SectionDndContext", () => ({
  SectionDndContext: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-section-dnd-context">{children}</div>
  ),
}));

vi.mock("forks/xyflow/core/container/ReactFlow", () => ({
  default: ({
    SectionBoundary,
  }: {
    SectionBoundary: ({ sectionId }: { sectionId: string }) => ReactNode;
  }) => (
    <div data-testid="mock-react-flow">
      <SectionBoundary sectionId="section-a" />
    </div>
  ),
}));

vi.mock("./settingsAllSettingsBenchmark", () => ({
  SettingsAllSettingsBenchmarkProvider: ({
    children,
  }: {
    children: ReactNode;
  }) => <div data-testid="mock-settings-benchmark-provider">{children}</div>,
}));

vi.mock("./ResponsiveMiniMap", () => ({
  ResponsiveMiniMap: () => <div data-testid="mock-responsive-minimap" />,
}));

vi.mock("components/Utils/ContextMenus/PaneContextMenu", () => ({
  PaneContextMenu: () => <div data-testid="mock-pane-context-menu" />,
}));

vi.mock("components/Utils/ContextMenus/SelectionContextMenu", () => ({
  SelectionContextMenu: () => <div data-testid="mock-selection-context-menu" />,
}));

vi.mock("components/Utils/ContextMenus/TypeErrorContextMenu", () => ({
  TypeErrorContextMenu: () => (
    <div data-testid="mock-type-error-context-menu" />
  ),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: (selector: (state: { showMinimap: boolean }) => unknown) =>
    selector({ showMinimap: true }),
  useMisc: { setState: () => {} },
}));

describe("UIPage", () => {
  it("keeps the top-level section boundary caller-owned above ReactFlow", () => {
    const TestSectionBoundary = ({ sectionId }: { sectionId: string }) => (
      <div
        data-testid="mock-section-container-boundary"
        data-section-id={sectionId}
      />
    );
    const markup = renderToStaticMarkup(
      <UIPage SectionBoundary={TestSectionBoundary} />,
    );

    expect(markup).toContain('data-testid="mock-settings-benchmark-provider"');
    expect(markup).toContain('data-testid="mock-section-dnd-context"');
    expect(markup).toContain('data-testid="mock-react-flow"');
    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="section-a"');
    expect(markup).toContain('data-testid="mock-pane-context-menu"');
    expect(markup).toContain('data-testid="mock-selection-context-menu"');
    expect(markup).toContain('data-testid="mock-type-error-context-menu"');
    expect(markup).toContain('data-testid="mock-responsive-minimap"');
  });
});
