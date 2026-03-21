/* @vitest-environment jsdom */

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { getSectionStylePreviewColorKey } from "utils/constants";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionWindowSurface } from "./SectionWindowSurface";

const mocks = vi.hoisted(() => ({
  getWindowSectionChrome: vi.fn(() => ({
    bgColor: "bg-setta-50",
    outerShellClassName: "mock-section-container-shell",
    innerShellClassName: "mock-section-surface",
    useMetaControlStyle: false,
  })),
  projectStateListeners: new Set<() => void>(),
  temporaryMiscStateListeners: new Set<() => void>(),
  sectionAreaSwitchRender: vi.fn(
    ({
      sectionId,
      chatHost,
      chatModeOverride,
      projectChatSurfaceId,
      projectChatId,
      setProjectChatId,
    }: {
      sectionId: string;
      chatHost: string;
      chatModeOverride?: string;
      projectChatSurfaceId?: string;
      projectChatId?: string | null;
      setProjectChatId?: unknown;
    }) => (
      <div
        data-testid="mock-area-switch"
        data-section-id={sectionId}
        data-chat-host={chatHost}
        data-chat-mode-override={chatModeOverride ?? ""}
        data-project-chat-surface-id={projectChatSurfaceId ?? ""}
        data-project-chat-id={projectChatId ?? ""}
        data-project-chat-controlled={setProjectChatId ? "true" : "false"}
      />
    ),
  ),
  sectionHeaderRender: vi.fn(
    ({
      showSectionContainerControls = true,
      extraControls = null,
    }: {
      showSectionContainerControls?: boolean;
      extraControls?: ReactNode;
    }) => (
      <div
        data-testid="mock-section-header"
        data-show-section-container-controls={
          showSectionContainerControls ? "true" : "false"
        }
      >
        {extraControls}
      </div>
    ),
  ),
}));

type MockProjectState = {
  projectConfig: {
    activeIds: string[];
  };
};

type MockReactFlowState = {
  viewportInteractionActive: boolean;
  transform: [number, number, number];
};

type MockNodeInternalsState = {
  x: Map<string, { width: number | null; height: number | null }>;
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    activeIds: [],
  },
};
let mockTemporaryMiscState: Record<string, string | null | undefined> = {};
let mockReactFlowState: MockReactFlowState = {
  viewportInteractionActive: false,
  transform: [0, 0, 1],
};
let mockNodeInternalsState: MockNodeInternalsState = {
  x: new Map([["section-1", { width: 200, height: 100 }]]),
};
let mockIsActiveSection = false;

function emitProjectStateChange() {
  for (const listener of mocks.projectStateListeners) {
    listener();
  }
}

function emitTemporaryMiscStateChange() {
  for (const listener of mocks.temporaryMiscStateListeners) {
    listener();
  }
}

vi.mock("state/definitions", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

    return {
      useLocalStorage: () => false,
    useProjectState: (
      selector: (state: MockProjectState) => unknown,
      equality: (a: unknown, b: unknown) => boolean = Object.is,
    ) => {
      const lastSelectedRef = React.useRef<unknown>(undefined);
      const hasSelectedRef = React.useRef(false);
      const getSelectedState = () => {
        const nextSelected = selector(mockProjectState);
        if (!hasSelectedRef.current) {
          hasSelectedRef.current = true;
          lastSelectedRef.current = nextSelected;
          return nextSelected;
        }
        const lastSelected = lastSelectedRef.current;
        if (equality(lastSelected, nextSelected)) {
          return lastSelected;
        }
        lastSelectedRef.current = nextSelected;
        return nextSelected;
      };

      return React.useSyncExternalStore(
        (listener) => {
          mocks.projectStateListeners.add(listener);
          return () => mocks.projectStateListeners.delete(listener);
        },
        getSelectedState,
        getSelectedState,
      );
    },
    useTemporaryMiscState: (
      selector: (
        state: Record<string, string | null | undefined>,
      ) => unknown = (state) => state,
    ) =>
      React.useSyncExternalStore(
        (listener) => {
          mocks.temporaryMiscStateListeners.add(listener);
          return () => mocks.temporaryMiscStateListeners.delete(listener);
        },
        () => selector(mockTemporaryMiscState),
        () => selector(mockTemporaryMiscState),
      ),
    useNodeInternals: (
      selector: (state: MockNodeInternalsState) => unknown,
    ) => selector(mockNodeInternalsState),
  };
});

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (selector: (state: MockReactFlowState) => unknown) =>
    selector(mockReactFlowState),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: () => mockIsActiveSection,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => ({
    type: SectionTypeEnum.Chat,
    isInOtherProjectConfigs: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    styleColor: null,
  }),
}));

vi.mock("state/actions/uiTypes/utils", () => ({
  getIsRoot: () => false,
}));

vi.mock("../Header/SectionHeader", () => ({
  SectionHeader: mocks.sectionHeaderRender,
}));

vi.mock("./SectionAreaSwitch", () => ({
  SectionAreaSwitch: mocks.sectionAreaSwitchRender,
}));

vi.mock("./sectionChrome", () => ({
  getWindowSectionChrome: mocks.getWindowSectionChrome,
}));

describe("SectionWindowSurface", () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        activeIds: ["section-1"],
      },
    };
    mocks.getWindowSectionChrome.mockClear();
    mocks.projectStateListeners.clear();
    mocks.temporaryMiscStateListeners.clear();
    mocks.sectionAreaSwitchRender.mockClear();
    mocks.sectionHeaderRender.mockClear();
    mockTemporaryMiscState = {};
    mockReactFlowState = {
      viewportInteractionActive: false,
      transform: [0, 0, 1],
    };
    mockNodeInternalsState = {
      x: new Map([["section-1", { width: 200, height: 100 }]]),
    };
    mockIsActiveSection = false;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    if (host) {
      host.remove();
    }
    host = null;
  });

  it("passes authoritative window mode and chat identity into the section area switch", () => {
    const markup = renderToStaticMarkup(
      <SectionWindowSurface
        sectionId="section-1"
        headerActions={null}
        roundedClassName="rounded-none"
        chatHost={ChatWindowPlacementEnum.floating}
        chatModeOverride={ChatWindowModeEnum.project_ai_mode}
        projectChatSurfaceId="window-surface-1"
        projectChatId="chat-section-1"
        setProjectChatId={() => {}}
      />,
    );

    expect(markup).toContain('data-testid="mock-area-switch"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-chat-host="floating"');
    expect(markup).toContain('data-chat-mode-override="project_ai_mode"');
    expect(markup).toContain('data-project-chat-surface-id="window-surface-1"');
    expect(markup).toContain('data-project-chat-id="chat-section-1"');
    expect(markup).toContain('data-project-chat-controlled="true"');
  });

  it("disables canvas section controls so window surfaces only render supplied header actions", () => {
    const markup = renderToStaticMarkup(
      <SectionWindowSurface
        sectionId="section-1"
        headerActions={<button data-testid="window-only-action" />}
        roundedClassName="rounded-none"
        chatHost={ChatWindowPlacementEnum.floating}
      />,
    );

    expect(markup).toContain('data-show-section-container-controls="false"');
    expect(markup).toContain('data-testid="window-only-action"');
  });

  it("routes standalone full-bleed chrome decisions through the shared helper", () => {
    renderToStaticMarkup(
      <SectionWindowSurface
        sectionId="section-1"
        headerActions={null}
        roundedClassName="rounded-xl"
        chatHost="standalone_page"
      />,
    );

    expect(mocks.getWindowSectionChrome).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionTypeName: SectionTypeEnum.Chat,
        isStandalonePage: true,
        roundedClassName: "rounded-xl",
      }),
    );
  });

  it("keeps explicit body overrides outside the shared area switch path", () => {
    const markup = renderToStaticMarkup(
      <SectionWindowSurface
        sectionId="section-1"
        headerActions={null}
        roundedClassName="rounded-none"
        chatHost={ChatWindowPlacementEnum.floating}
        bodyOverride={<div data-testid="window-body-override" />}
      />,
    );

    expect(markup).toContain('data-testid="window-body-override"');
    expect(markup).not.toContain('data-testid="mock-area-switch"');
  });

  it("keeps the window body path stable when only durable activeIds change", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => {
      root?.render(
        <SectionWindowSurface
          sectionId="section-1"
          headerActions={null}
          roundedClassName="rounded-none"
          chatHost={ChatWindowPlacementEnum.floating}
        />,
      );
    });

    expect(mocks.getWindowSectionChrome).toHaveBeenCalledTimes(1);
    expect(mocks.sectionAreaSwitchRender).toHaveBeenCalledTimes(1);

    mockProjectState = {
      projectConfig: {
        activeIds: [],
      },
    };

    act(() => {
      emitProjectStateChange();
    });

    expect(mocks.getWindowSectionChrome).toHaveBeenCalledTimes(1);
    expect(mocks.sectionAreaSwitchRender).toHaveBeenCalledTimes(1);
  });

  it("keeps the window body path stable when only preview theme state changes", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => {
      root?.render(
        <SectionWindowSurface
          sectionId="section-1"
          headerActions={null}
          roundedClassName="rounded-none"
          chatHost={ChatWindowPlacementEnum.floating}
        />,
      );
    });

    expect(mocks.getWindowSectionChrome).toHaveBeenCalledTimes(1);
    expect(mocks.sectionHeaderRender).toHaveBeenCalledTimes(1);
    expect(mocks.sectionAreaSwitchRender).toHaveBeenCalledTimes(1);

    mockTemporaryMiscState = {
      [getSectionStylePreviewColorKey("section-1")]: "#4f46e5",
    };

    act(() => {
      emitTemporaryMiscStateChange();
    });

    expect(mocks.getWindowSectionChrome).toHaveBeenCalledTimes(2);
    expect(mocks.sectionHeaderRender).toHaveBeenCalledTimes(2);
    expect(mocks.sectionAreaSwitchRender).toHaveBeenCalledTimes(1);
  });
});
