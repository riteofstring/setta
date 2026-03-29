/* @vitest-environment jsdom */

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UIPage } from "./UiPage";

const hoisted = vi.hoisted(() => ({
  attachKeyEventListenersMock: vi.fn(() => () => {}),
  clearCurrentProjectViewportForRefitMock: vi.fn(),
  syncLiveDictAreaInteractionModeFromSearchMock: vi.fn(),
  syncLiveDictAreaRendererModeFromSearchMock: vi.fn(() => ({
    resolvedMode: "dom",
    shouldClearViewportForRefit: false,
  })),
}));

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

vi.mock("state/actions/keyActivations", () => ({
  attachKeyEventListeners: hoisted.attachKeyEventListenersMock,
}));

vi.mock("state/actions/sectionInfos", () => ({
  clearCurrentProjectViewportForRefit:
    hoisted.clearCurrentProjectViewportForRefitMock,
}));

vi.mock("../../Section/Layouts/liveDictAreaInteractionMode", () => ({
  syncLiveDictAreaInteractionModeFromSearch:
    hoisted.syncLiveDictAreaInteractionModeFromSearchMock,
}));

vi.mock("../../Section/Layouts/liveDictAreaRendererMode", () => ({
  syncLiveDictAreaRendererModeFromSearch:
    hoisted.syncLiveDictAreaRendererModeFromSearchMock,
}));

describe("UIPage", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.attachKeyEventListenersMock.mockClear();
    hoisted.clearCurrentProjectViewportForRefitMock.mockClear();
    hoisted.syncLiveDictAreaInteractionModeFromSearchMock.mockClear();
    hoisted.syncLiveDictAreaRendererModeFromSearchMock.mockReset();
    hoisted.syncLiveDictAreaRendererModeFromSearchMock.mockReturnValue({
      resolvedMode: "dom",
      shouldClearViewportForRefit: false,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState({}, "", "/settings");
    window.sessionStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

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

  it("clears the saved viewport when the renderer sync requests a viewport refit", async () => {
    hoisted.syncLiveDictAreaRendererModeFromSearchMock.mockReturnValue({
      resolvedMode: "pixi-node-body",
      shouldClearViewportForRefit: true,
    });
    window.history.replaceState(
      {},
      "",
      "/settings?liveDictAreaRenderer=pixi-node-body",
    );

    await act(async () => {
      root.render(
        <UIPage
          SectionBoundary={({ sectionId }: { sectionId: string }) => (
            <div data-section-id={sectionId} />
          )}
        />,
      );
    });

    expect(
      hoisted.syncLiveDictAreaRendererModeFromSearchMock,
    ).toHaveBeenCalledWith("?liveDictAreaRenderer=pixi-node-body");
    expect(
      hoisted.syncLiveDictAreaInteractionModeFromSearchMock,
    ).toHaveBeenCalledWith("?liveDictAreaRenderer=pixi-node-body");
    expect(
      hoisted.clearCurrentProjectViewportForRefitMock,
    ).toHaveBeenCalledTimes(1);
  });
});
