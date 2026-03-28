import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCore } from "./SectionContainerCore";

type MockProjectState = {
  projectConfig: {
    id: string;
  };
};

type MockSectionImpl = {
  type: string;
  isInOtherProjectConfigs: boolean;
  positionAndSizeLocked: boolean;
  metaControlStyle: boolean;
  isMinimized: boolean;
  styleColor: string | null;
};

const previewStyleColorKey = "mock-preview-style-color";

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
};
let mockSectionImpl: MockSectionImpl = {
  type: SectionTypeEnum.Code,
  isInOtherProjectConfigs: false,
  positionAndSizeLocked: false,
  metaControlStyle: false,
  isMinimized: false,
  styleColor: null,
};
let mockRenderSectionHandles = true;
let mockViewportInteractionActive = false;
let mockDarkMode = false;
let mockPreviewStyleColor: string | null | undefined = undefined;
let mockActiveSectionIds = new Set<string>();

vi.mock("components/Pages/Project/settingsAllSettingsBenchmark", () => ({
  useSettingsAllSettingsBenchmark: () => ({
    renderSectionHandles: mockRenderSectionHandles,
  }),
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { viewportInteractionActive: boolean }) => unknown,
  ) =>
    selector({
      viewportInteractionActive: mockViewportInteractionActive,
    }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getAttachedTerminalParentIdForTerminalSection: () => null,
  getCurrEffectiveSectionImpl: () => mockSectionImpl,
  getEmbeddedAttachedTerminalParentIdForTerminalSection: () => null,
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: (sectionId: string) =>
    mockActiveSectionIds.has(sectionId),
}));

vi.mock("state/definitions", () => ({
  useAgenticScopeHighlights: (
    selector: (
      state: {
        readSectionIdsByProjectConfigId: Record<string, Record<string, boolean>>;
        writeSectionIdsByProjectConfigId: Record<string, Record<string, boolean>>;
      },
    ) => unknown,
  ) =>
    selector({
      readSectionIdsByProjectConfigId: {
        "project-1": {},
      },
      writeSectionIdsByProjectConfigId: {
        "project-1": {},
      },
    }),
  useLocalStorage: (selector: (state: { darkMode: boolean }) => unknown) =>
    selector({
      darkMode: mockDarkMode,
    }),
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
  useTemporaryMiscState: (
    selector: (state: Record<string, string | null | undefined>) => unknown,
  ) =>
    selector({
      [previewStyleColorKey]: mockPreviewStyleColor,
    }),
}));

vi.mock("state/hooks/sectionRef", () => ({
  useSectionRefAndInit: () => null,
}));

vi.mock("utils/constants", () => ({
  getSectionStylePreviewColorKey: () => previewStyleColorKey,
}));

vi.mock("utils/sectionStyleColors", () => ({
  deriveSectionStyleTheme: () => ({
    bg: "bg",
    panelBg: "panel",
    border: "border",
    outline: "outline",
    text: "text",
    mutedText: "muted",
  }),
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: ({ isUserView }: { isUserView: boolean }) => (
    <div
      data-testid="mock-agentic-edge-handles"
      data-is-user-view={isUserView ? "true" : "false"}
    />
  ),
}));

vi.mock("./ChatSharedEdgeHandles", () => ({
  ChatSharedEdgeHandles: ({ isUserView }: { isUserView: boolean }) => (
    <div
      data-testid="mock-chat-shared-edge-handles"
      data-is-user-view={isUserView ? "true" : "false"}
    />
  ),
}));

vi.mock("./MinimizedDataEdgeHandles", () => ({
  MinimizedDataEdgeHandles: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-minimized-data-edge-handles">{sectionId}</div>
  ),
}));

vi.mock("./sectionChrome", () => ({
  getSectionContainerShellClassName: () => "mock-section-shell",
}));

vi.mock("./SectionContainerCoreCanvasBody", () => ({
  SectionContainerCoreCanvasBody: ({
    sectionId,
    sectionTypeName,
    bgColor,
    isMinimized,
    isUserView,
  }: {
    sectionId: string;
    sectionTypeName: string;
    bgColor: string;
    isMinimized: boolean;
    isUserView: boolean;
  }) => (
    <div
      data-testid="mock-core-canvas-body"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-bg-color={bgColor}
      data-is-minimized={isMinimized ? "true" : "false"}
      data-is-user-view={isUserView ? "true" : "false"}
    />
  ),
}));

vi.mock("./SectionContainerCoreResizabe", () => ({
  SectionContainerCoreResizable: ({
    sectionTypeName,
    bgColor,
    hideHeader = false,
    children,
  }: {
    sectionTypeName: string;
    bgColor: string;
    hideHeader?: boolean;
    children: ReactNode;
  }) => (
    <div
      data-testid="mock-core-resizable"
      data-section-type={sectionTypeName}
      data-bg-color={bgColor}
      data-hide-header={hideHeader ? "true" : "false"}
    >
      {children}
    </div>
  ),
}));

vi.mock("./StateMachineEdgeHandles", () => ({
  StateMachineEdgeHandles: ({ isUserView }: { isUserView: boolean }) => (
    <div
      data-testid="mock-state-machine-edge-handles"
      data-is-user-view={isUserView ? "true" : "false"}
    />
  ),
}));

vi.mock("./utils", () => ({
  getOnSectionClick: () => undefined,
  useAiSectionHighlight: () => false,
}));

describe("SectionContainerCore", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
    };
    mockSectionImpl = {
      type: SectionTypeEnum.Code,
      isInOtherProjectConfigs: false,
      positionAndSizeLocked: false,
      metaControlStyle: false,
      isMinimized: false,
      styleColor: null,
    };
    mockRenderSectionHandles = true;
    mockViewportInteractionActive = false;
    mockDarkMode = false;
    mockPreviewStyleColor = undefined;
    mockActiveSectionIds = new Set<string>();
  });

  it("owns the lifted core canvas-body handoff above the resizable shell", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerCore
        sectionId="section-123"
        isUserView={false}
        bodyProps={{
          sectionId: "section-123",
          sectionTypeName: SectionTypeEnum.Code,
          bgColor: "bg-setta-50",
          isMinimized: false,
          isUserView: false,
        }}
      />,
    );

    expect(markup).toContain('data-testid="mock-core-resizable"');
    expect(markup).toContain('data-testid="mock-core-canvas-body"');
    expect(markup).toContain('data-section-id="section-123"');
    expect(markup).toContain(`data-section-type="${SectionTypeEnum.Code}"`);
    expect(markup).toContain('data-bg-color="bg-setta-50"');
    expect(markup).toContain('data-is-minimized="false"');
    expect(markup).toContain('data-hide-header="false"');
  });
});
