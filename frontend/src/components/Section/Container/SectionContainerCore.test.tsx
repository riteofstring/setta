/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCore } from "./SectionContainerCore";

const mocks = vi.hoisted(() => ({
  activeListeners: new Set<() => void>(),
  agenticEdgeHandlesRender: vi.fn(({ isUserView }: { isUserView: boolean }) => (
    <div
      data-testid="mock-agentic-edge-handles"
      data-user-view={isUserView ? "true" : "false"}
    />
  )),
  chatSharedEdgeHandlesRender: vi.fn(
    ({ isUserView }: { isUserView: boolean }) => (
      <div
        data-testid="mock-chat-shared-edge-handles"
        data-user-view={isUserView ? "true" : "false"}
      />
    ),
  ),
  minimizedDataEdgeHandlesRender: vi.fn(
    ({ sectionId }: { sectionId: string }) => (
      <div
        data-testid="mock-minimized-data-edge-handles"
        data-section-id={sectionId}
      />
    ),
  ),
  sectionContainerCoreResizableRender: vi.fn(
    ({
      sectionId,
      hideHeader = false,
    }: {
      sectionId: string;
      hideHeader?: boolean;
    }) => (
      <div
        data-testid="mock-section-container-core-resizable"
        data-section-id={sectionId}
        data-hide-header={hideHeader ? "true" : "false"}
      />
    ),
  ),
  stateMachineEdgeHandlesRender: vi.fn(
    ({ isUserView }: { isUserView: boolean }) => (
      <div
        data-testid="mock-state-machine-edge-handles"
        data-user-view={isUserView ? "true" : "false"}
      />
    ),
  ),
}));

let mockIsActiveSection = false;
let mockViewportInteractionActive = false;
let mockSectionImpl = {
  type: "Code",
  isInOtherProjectConfigs: false,
  positionAndSizeLocked: false,
  metaControlStyle: false,
  styleColor: null,
  isMinimized: false,
};

function emitActiveSectionChange() {
  for (const listener of mocks.activeListeners) {
    listener();
  }
}

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { viewportInteractionActive: boolean }) => unknown,
  ) => selector({ viewportInteractionActive: mockViewportInteractionActive }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getAttachedTerminalParentIdForTerminalSection: () => null,
  getCurrEffectiveSectionImpl: () => mockSectionImpl,
  getEmbeddedAttachedTerminalParentIdForTerminalSection: () => null,
}));

vi.mock("state/activeSectionUI", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useIsSectionUIActive: () =>
      React.useSyncExternalStore(
        (listener) => {
          mocks.activeListeners.add(listener);
          return () => mocks.activeListeners.delete(listener);
        },
        () => mockIsActiveSection,
        () => mockIsActiveSection,
      ),
  };
});

vi.mock("state/definitions", () => ({
  useAgenticScopeHighlights: (
    selector: (state: {
      readSectionIdsByProjectConfigId: Record<string, Record<string, boolean>>;
      writeSectionIdsByProjectConfigId: Record<string, Record<string, boolean>>;
    }) => unknown,
  ) =>
    selector({
      readSectionIdsByProjectConfigId: {},
      writeSectionIdsByProjectConfigId: {},
    }),
  useLocalStorage: (selector: (state: { darkMode: boolean }) => unknown) =>
    selector({ darkMode: false }),
  useProjectState: (
    selector: (state: { projectConfig: { id: string } }) => unknown,
  ) => selector({ projectConfig: { id: "project-1" } }),
  useTemporaryMiscState: () => undefined,
}));

vi.mock("state/hooks/sectionRef", () => ({
  useSectionRefAndInit: () => ({ current: null }),
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: mocks.agenticEdgeHandlesRender,
}));

vi.mock("./ChatSharedEdgeHandles", () => ({
  ChatSharedEdgeHandles: mocks.chatSharedEdgeHandlesRender,
}));

vi.mock("./MinimizedDataEdgeHandles", () => ({
  MinimizedDataEdgeHandles: mocks.minimizedDataEdgeHandlesRender,
}));

vi.mock("./SectionContainerCoreResizabe", () => ({
  SectionContainerCoreResizable: mocks.sectionContainerCoreResizableRender,
}));

vi.mock("./StateMachineEdgeHandles", () => ({
  StateMachineEdgeHandles: mocks.stateMachineEdgeHandlesRender,
}));

vi.mock("./sectionChrome", () => ({
  getSectionContainerShellClassName: ({
    isActiveSection,
    scopeHighlightClassName,
  }: {
    isActiveSection: boolean;
    scopeHighlightClassName?: string;
  }) =>
    `mock-shell ${isActiveSection ? "mock-shell-active" : "mock-shell-inactive"} ${scopeHighlightClassName ?? ""}`.trim(),
}));

vi.mock("./utils", () => ({
  getOnSectionClick: () => () => {},
  useAiSectionHighlight: () => false,
}));

describe("SectionContainerCore", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockIsActiveSection = false;
    mockViewportInteractionActive = false;
    mockSectionImpl = {
      type: SectionTypeEnum.Code,
      isInOtherProjectConfigs: false,
      positionAndSizeLocked: false,
      metaControlStyle: false,
      styleColor: null,
      isMinimized: false,
    };
    mocks.activeListeners.clear();
    mocks.agenticEdgeHandlesRender.mockClear();
    mocks.chatSharedEdgeHandlesRender.mockClear();
    mocks.minimizedDataEdgeHandlesRender.mockClear();
    mocks.sectionContainerCoreResizableRender.mockClear();
    mocks.stateMachineEdgeHandlesRender.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("keeps the static shell subtree stable when only active state changes", () => {
    act(() => {
      root.render(
        <SectionContainerCore sectionId="section-1" isUserView={false} />,
      );
    });

    expect(
      host
        .querySelector('section[data-section-id="section-1"]')
        ?.getAttribute("data-section-active"),
    ).toBe("false");
    expect(mocks.agenticEdgeHandlesRender).toHaveBeenCalledTimes(1);
    expect(mocks.minimizedDataEdgeHandlesRender).toHaveBeenCalledTimes(1);
    expect(mocks.sectionContainerCoreResizableRender).toHaveBeenCalledTimes(1);

    mockIsActiveSection = true;

    act(() => {
      emitActiveSectionChange();
    });

    expect(
      host
        .querySelector('section[data-section-id="section-1"]')
        ?.getAttribute("data-section-active"),
    ).toBe("true");
    expect(mocks.agenticEdgeHandlesRender).toHaveBeenCalledTimes(1);
    expect(mocks.minimizedDataEdgeHandlesRender).toHaveBeenCalledTimes(1);
    expect(mocks.sectionContainerCoreResizableRender).toHaveBeenCalledTimes(1);
  });

  it("routes chat sections through the shared chat handle layer", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Chat,
      isInOtherProjectConfigs: false,
      positionAndSizeLocked: false,
      metaControlStyle: false,
      styleColor: null,
      isMinimized: false,
    };

    act(() => {
      root.render(
        <SectionContainerCore sectionId="section-1" isUserView={true} />,
      );
    });

    expect(mocks.chatSharedEdgeHandlesRender).toHaveBeenCalledTimes(1);
    expect(mocks.agenticEdgeHandlesRender).not.toHaveBeenCalled();
    expect(mocks.stateMachineEdgeHandlesRender).not.toHaveBeenCalled();
    expect(
      host
        .querySelector('[data-testid="mock-chat-shared-edge-handles"]')
        ?.getAttribute("data-user-view"),
    ).toBe("true");
  });

  it("does not add gesture-time compositor promotion styles during viewport interaction", () => {
    mockViewportInteractionActive = true;

    act(() => {
      root.render(
        <SectionContainerCore sectionId="section-1" isUserView={false} />,
      );
    });

    const section = host.querySelector(
      'section[data-section-id="section-1"]',
    ) as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section?.style.willChange).toBe("");
    expect(section?.style.transform).toBe("");
    expect(section?.style.backfaceVisibility).toBe("");
    expect(section?.style.isolation).toBe("");
  });
});
