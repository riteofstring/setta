import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SectionBodyGate,
  getSectionBodyFamily,
  useResolvedSectionBodyStatus,
} from "./SectionBodyGate";

type MockProjectState = {
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
  sections: Record<string, object>;
};

type MockReactFlowState = {
  viewportInteractionActive: boolean;
  transform: [number, number, number];
  width: number;
  height: number;
};

type MockNodeInternalsState = {
  x: Map<
    string,
    {
      id: string;
      position: { x: number; y: number };
      width: number | null;
      height: number | null;
    }
  >;
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
  sections: { "section-123": {} },
};

let mockReactFlowState: MockReactFlowState = {
  viewportInteractionActive: false,
  transform: [0, 0, 1],
  width: 1200,
  height: 800,
};

let mockNodeInternalsState: MockNodeInternalsState = {
  x: new Map([
    [
      "section-123",
      {
        id: "section-123",
        position: { x: 100, y: 120 },
        width: 200,
        height: 100,
      },
    ],
  ]),
};

let mockIsActiveSection = false;

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => mockSectionImpl,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
  useNodeInternals: (selector: (state: MockNodeInternalsState) => unknown) =>
    selector(mockNodeInternalsState),
  useLocalStorage: (
    selector: (state: { overviewTrueWidth: number }) => unknown,
  ) => selector({ overviewTrueWidth: 320 }),
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
    keepPreviewWarm,
    showPreview,
  }: {
    children: ReactNode;
    sectionId: string;
    isActiveSection: boolean;
    keepPreviewWarm: boolean;
    showPreview: boolean;
  }) => (
    <div
      data-testid="mock-tier1-preview"
      data-section-id={sectionId}
      data-is-active={isActiveSection ? "true" : "false"}
      data-keep-preview-warm={keepPreviewWarm ? "true" : "false"}
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
      sections: { "section-123": {} },
    };
    mockReactFlowState = {
      viewportInteractionActive: false,
      transform: [0, 0, 1],
      width: 1200,
      height: 800,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 100, y: 120 },
            width: 200,
            height: 100,
          },
        ],
      ]),
    };
    mockIsActiveSection = false;
  });

  it("classifies section families for the hybrid-rendering rollout", () => {
    expect(getSectionBodyFamily(SectionTypeEnum.Callable)).toBe(
      "tier1-dense-params",
    );
    expect(getSectionBodyFamily(SectionTypeEnum.Code)).toBe("tier2-code");
    expect(getSectionBodyFamily(SectionTypeEnum.Browser)).toBe("sparse-local");
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
      sections: { "section-123": {} },
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
      width: 1200,
      height: 800,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 1380, y: 520 },
            width: 300,
            height: 180,
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
    expect(markup).toContain('data-keep-preview-warm="true"');
    expect(markup).toContain('data-show-preview="true"');
    expect(markup).toContain('data-testid="mock-area-switch"');
  });

  it("keeps dense sections outside the warm neighborhood on the live path during motion", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Callable,
      isMinimized: false,
    };
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState(),
      sections: {
        "section-123": {},
        "near-1": {},
        "near-2": {},
        "near-3": {},
        "near-4": {},
        "near-5": {},
        "near-6": {},
        "near-7": {},
        "near-8": {},
      },
    };
    mockReactFlowState = {
      viewportInteractionActive: true,
      transform: [0, 0, 0.6],
      width: 1200,
      height: 800,
    };
    mockNodeInternalsState = {
      x: new Map([
        [
          "section-123",
          {
            id: "section-123",
            position: { x: 3200, y: 2400 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-1",
          {
            id: "near-1",
            position: { x: 360, y: 220 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-2",
          {
            id: "near-2",
            position: { x: 700, y: 220 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-3",
          {
            id: "near-3",
            position: { x: 1040, y: 220 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-4",
          {
            id: "near-4",
            position: { x: 360, y: 460 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-5",
          {
            id: "near-5",
            position: { x: 700, y: 460 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-6",
          {
            id: "near-6",
            position: { x: 1040, y: 460 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-7",
          {
            id: "near-7",
            position: { x: 360, y: 700 },
            width: 300,
            height: 180,
          },
        ],
        [
          "near-8",
          {
            id: "near-8",
            position: { x: 700, y: 700 },
            width: 300,
            height: 180,
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
    expect(markup).toContain('data-keep-preview-warm="false"');
    expect(markup).toContain('data-show-preview="false"');
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
