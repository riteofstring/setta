import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node } from "forks/xyflow/core/types";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSectionBodyFamily,
  SectionBodyGate,
  useResolvedSectionBodyStatus,
} from "./SectionBodyGate";

type MockProjectState = {
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
};

type MockReactFlowState = {
  viewportInteractionActive: boolean;
  transform: [number, number, number];
  width: number;
  height: number;
};

type MockNodeInternalsState = {
  x: Map<string, Node>;
};

type MockLocalStorageState = {
  overviewTrueWidth: number;
};

let mockSectionImpl: {
  type: string;
  isMinimized: boolean;
} = {
  type: SectionTypeEnum.Code,
  isMinimized: false,
};

let mockProjectState: MockProjectState = {
  projectChatWindowing: createProjectChatWindowingState(),
};

let mockReactFlowState: MockReactFlowState = {
  viewportInteractionActive: false,
  transform: [0, 0, 1],
  width: 200,
  height: 120,
};

let mockNodeInternalsState: MockNodeInternalsState = {
  x: new Map([
    [
      "section-123",
      {
        id: "section-123",
        position: { x: 0, y: 0 },
        width: 200,
        height: 100,
        zIndex: 0,
        tempZIndex: 0,
      },
    ],
  ]),
};

let mockIsActiveSection = false;
let mockLocalStorageState: MockLocalStorageState = {
  overviewTrueWidth: 0,
};

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => mockSectionImpl,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
  useNodeInternals: (selector: (state: MockNodeInternalsState) => unknown) =>
    selector(mockNodeInternalsState),
  useLocalStorage: (selector: (state: MockLocalStorageState) => unknown) =>
    selector(mockLocalStorageState),
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (selector: (state: MockReactFlowState) => unknown) =>
    selector(mockReactFlowState),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: () => mockIsActiveSection,
}));

vi.mock("./SectionAreaSwitch", () => ({
  SectionAreaSwitch: ({
    sectionId,
    sectionTypeName,
    isUserView,
    chatHost,
    chatModeOverride,
  }: {
    sectionId: string;
    sectionTypeName: string;
    isUserView: boolean;
    chatHost?: string;
    chatModeOverride?: string;
  }) => (
    <div
      data-testid="mock-area-switch"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-user-view={isUserView ? "true" : "false"}
      data-chat-host={chatHost ?? ""}
      data-chat-mode={chatModeOverride ?? ""}
    />
  ),
}));

vi.mock("../Layouts/Tier1DenseParamSectionPreview", () => ({
  Tier1DenseParamSectionPreview: ({
    children,
    sectionId,
    isActiveSection,
    shouldWarmPreview,
    showPreview,
  }: {
    children: ReactNode;
    sectionId: string;
    isActiveSection: boolean;
    shouldWarmPreview: boolean;
    showPreview: boolean;
  }) => (
    <div
      data-testid="mock-tier1-preview"
      data-section-id={sectionId}
      data-is-active={isActiveSection ? "true" : "false"}
      data-should-warm-preview={shouldWarmPreview ? "true" : "false"}
      data-show-preview={showPreview ? "true" : "false"}
    >
      {children}
    </div>
  ),
}));

vi.mock("./SectionWindowPlaceholder", () => ({
  SectionWindowPlaceholder: ({
    instanceId,
    sectionId,
  }: {
    instanceId: string;
    sectionId: string;
  }) => (
    <div
      data-testid="mock-window-placeholder"
      data-instance-id={instanceId}
      data-section-id={sectionId}
    />
  ),
}));

describe("SectionBodyGate", () => {
  beforeEach(() => {
    mockSectionImpl = {
      type: SectionTypeEnum.Code,
      isMinimized: false,
    };
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState(),
    };
    mockReactFlowState = {
      viewportInteractionActive: false,
      transform: [0, 0, 1],
      width: 200,
      height: 120,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 0, y: 0 },
            width: 200,
            height: 100,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    };
    mockIsActiveSection = false;
    mockLocalStorageState = {
      overviewTrueWidth: 0,
    };
  });

  it("classifies section families for the hybrid-rendering rollout", () => {
    expect(getSectionBodyFamily(SectionTypeEnum.Callable)).toBe(
      "tier1-dense-params",
    );
    expect(getSectionBodyFamily(SectionTypeEnum.Code)).toBe("tier2-code");
    expect(getSectionBodyFamily(SectionTypeEnum.Browser)).toBe(
      "sparse-local",
    );
    expect(getSectionBodyFamily(SectionTypeEnum.Image)).toBe("generic");
  });

  it("keeps the canvas placeholder path for externalized non-chat sections", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            isClosed: true,
            isMinimized: false,
            isMaximized: false,
            bounds: { x: 0, y: 0, width: 320, height: 200 },
            dockMetrics: {
              widthFraction: null,
              preferredWidthPx: null,
            },
            zIndex: 1,
            mode: ChatWindowModeEnum.section_mode,
            title: "Section window",
            lastFocusedAt: 0,
            chatId: null,
          }),
        },
      }),
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: false }}
      />,
    );

    expect(markup).toContain('data-testid="mock-window-placeholder"');
    expect(markup).toContain('data-instance-id="project-chat-window-1"');
    expect(markup).not.toContain('data-testid="mock-area-switch"');
  });

  it("keeps requested preview mode on the live path until a preview surface exists", () => {
    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        requestedMode="preview"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: true }}
      />,
    );

    expect(markup).toContain('data-testid="mock-area-switch"');
    expect(markup).toContain('data-user-view="true"');
  });

  it("shows tier1 preview overlays only for sections inside the visible pane", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Callable,
      isMinimized: false,
    };
    mockReactFlowState = {
      viewportInteractionActive: true,
      transform: [0, 0, 0.8],
      width: 200,
      height: 120,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 40, y: 20 },
            width: 140,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: false }}
      />,
    );

    expect(markup).toContain('data-testid="mock-tier1-preview"');
    expect(markup).toContain('data-should-warm-preview="true"');
    expect(markup).toContain('data-show-preview="true"');
  });

  it("warms nearby tier1 sections without showing overlays until they reach the pane", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Callable,
      isMinimized: false,
    };
    mockReactFlowState = {
      viewportInteractionActive: true,
      transform: [0, 0, 0.8],
      width: 200,
      height: 120,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 255, y: 10 },
            width: 40,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: false }}
      />,
    );

    expect(markup).toContain('data-testid="mock-tier1-preview"');
    expect(markup).toContain('data-should-warm-preview="true"');
    expect(markup).toContain('data-show-preview="false"');
  });

  it("keeps far tier1 sections on the live path until they return near the pane", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Callable,
      isMinimized: false,
    };
    mockReactFlowState = {
      viewportInteractionActive: true,
      transform: [0, 0, 0.8],
      width: 200,
      height: 120,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 330, y: 10 },
            width: 40,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: false }}
      />,
    );

    expect(markup).toContain('data-testid="mock-tier1-preview"');
    expect(markup).toContain('data-should-warm-preview="false"');
    expect(markup).toContain('data-show-preview="false"');
  });

  it("skips minimized sections before they reach the body switch", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Code,
      isMinimized: true,
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: false }}
      />,
    );

    expect(markup).toBe("");
  });

  it("passes the window chat host contract through the shared body gate", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Chat,
      isMinimized: false,
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{
          kind: "window",
          bgColor: "bg-setta-50",
          chatHost: ChatWindowPlacementEnum.floating,
          chatModeOverride: ChatWindowModeEnum.project_ai_mode,
        }}
      />,
    );

    expect(markup).toContain('data-testid="mock-area-switch"');
    expect(markup).toContain('data-chat-host="floating"');
    expect(markup).toContain('data-chat-mode="project_ai_mode"');
  });

  it("derives preview mode for inactive dense sections from viewport motion and projected size", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Callable,
      isMinimized: false,
    };
    mockReactFlowState = {
      viewportInteractionActive: true,
      transform: [0, 0, 0.6],
      width: 240,
      height: 180,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 0, y: 0 },
            width: 300,
            height: 180,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    };

    const markup = renderToStaticMarkup(
      <SectionBodyGate
        sectionId="section-123"
        owner={{ kind: "canvas", bgColor: "bg-setta-50", isUserView: false }}
      />,
    );

    expect(markup).toContain('data-testid="mock-tier1-preview"');
    expect(markup).toContain('data-show-preview="true"');
    expect(markup).toContain('data-testid="mock-area-switch"');
  });

  it("exposes resolved status for tests and future render-mode work", () => {
    let statusText = "";

    function StatusProbe() {
      const status = useResolvedSectionBodyStatus({
        sectionId: "section-123",
        owner: { kind: "canvas", bgColor: "bg-setta-50", isUserView: false },
      });
      statusText = `${status.family}:${status.requestedMode}:${status.resolvedMode}:${status.sectionTypeName}`;
      return null;
    }

    renderToStaticMarkup(<StatusProbe />);

    expect(statusText).toBe("tier2-code:live:live:Code");
  });
});
