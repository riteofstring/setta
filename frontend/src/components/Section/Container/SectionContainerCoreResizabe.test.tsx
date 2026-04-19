import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AreaSwitch,
  SectionContainerCoreResizable,
} from "./SectionContainerCoreResizabe";

type MockProjectState = {
  projectConfig: {
    id: string;
  };
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
};

const mockCanvasState = {
  activeSectionId: null as string | null,
  graphSurfaceImplementation: "legacy-dom" as
    | "legacy-dom"
    | "canvas-shell-underlay",
  viewportInteractionActive: false,
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
  projectChatWindowing: createProjectChatWindowingState(),
};

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    mode,
    host,
    sectionId,
    surfaceId,
    projectChatId,
    setProjectChatId,
  }: {
    mode: string;
    host: string;
    sectionId?: string | null;
    surfaceId?: string;
    projectChatId?: string | null;
    setProjectChatId?: unknown;
  }) => (
    <div
      data-testid="mock-unified-chat-surface"
      data-mode={mode}
      data-host={host}
      data-section-id={sectionId ?? ""}
      data-surface-id={surfaceId ?? ""}
      data-project-chat-id={projectChatId ?? ""}
      data-project-chat-controlled={setProjectChatId ? "true" : "false"}
    />
  ),
}));

vi.mock("components/Utils/Resizable/CustomResizable", () => ({
  CustomResizable: ({ children }: { children: ReactNode }) => (
    <section data-testid="mock-custom-resizable">{children}</section>
  ),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => ({
    type: SectionTypeEnum.Code,
    isMinimized: false,
    metaControlStyle: false,
  }),
  getEmbeddedAttachedTerminalForCodeSection: () => null,
}));

vi.mock("state/actions/uiTypes/utils", () => ({
  getIsRoot: () => false,
}));

vi.mock("forks/xyflow/core/container/graphSurfaceImplementation", () => ({
  useGraphSurfaceImplementation: () => mockCanvasState.graphSurfaceImplementation,
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (selector: (state: { viewportInteractionActive: boolean }) => unknown) =>
    selector({
      viewportInteractionActive: mockCanvasState.viewportInteractionActive,
    }),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: (sectionId: string) =>
    mockCanvasState.activeSectionId === sectionId,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

vi.mock("../Header/SectionHeader", () => ({
  SectionHeader: () => <header data-testid="mock-section-header" />,
}));

vi.mock("../Header/SectionWindowToggleButton", () => ({
  SectionWindowToggleButton: () => (
    <button type="button" data-testid="mock-section-window-toggle" />
  ),
}));

vi.mock("./SectionWindowPlaceholder", () => ({
  SectionWindowPlaceholder: ({
    instanceId,
    sectionId,
    dataTestId,
  }: {
    instanceId: string;
    sectionId: string;
    dataTestId?: string;
  }) => (
    <div
      data-testid={dataTestId ?? "mock-section-window-placeholder"}
      data-instance-id={instanceId}
      data-section-id={sectionId}
    />
  ),
}));

vi.mock("./utils", () => ({
  getBgColor: () => "bg-setta-50",
}));

vi.mock("../Layouts/CodeArea", () => ({
  CodeArea: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-code-area">code:{sectionId}</div>
  ),
  GenPythonCodeArea: () => <div data-testid="mock-gen-python-code-area" />,
  GenPythonMetadataArea: () => (
    <div data-testid="mock-gen-python-metadata-area" />
  ),
}));

vi.mock("../Layouts/BrowserArea", () => ({
  BrowserArea: () => <div data-testid="mock-browser-area" />,
}));
vi.mock("../Layouts/CallableArea", () => ({
  CallableArea: () => <div data-testid="mock-callable-area" />,
}));
vi.mock("../Layouts/ChartArea/ChartArea", () => ({
  ChartArea: () => <div data-testid="mock-chart-area" />,
}));
vi.mock("../Layouts/DictArea", () => ({
  DictArea: () => <div data-testid="mock-dict-area" />,
}));
vi.mock("../Layouts/DrawArea/DrawArea", () => ({
  DrawArea: () => <div data-testid="mock-draw-area" />,
}));
vi.mock("../Layouts/GlobalVariablesArea", () => ({
  GlobalVariablesArea: () => <div data-testid="mock-global-variables-area" />,
}));
vi.mock("../Layouts/IframeArea", () => ({
  IframeArea: () => <div data-testid="mock-iframe-area" />,
}));
vi.mock("../Layouts/ImageArea", () => ({
  ImageArea: () => <div data-testid="mock-image-area" />,
}));
vi.mock("../Layouts/MetaControlArea", () => ({
  MetaControlArea: () => <div data-testid="mock-meta-control-area" />,
}));
vi.mock("../Layouts/PluginArea", () => ({
  PluginArea: () => <div data-testid="mock-plugin-area" />,
}));
vi.mock("../Layouts/PromptArea", () => ({
  PromptArea: () => <div data-testid="mock-prompt-area" />,
}));
vi.mock("../Layouts/SocialArea", () => ({
  SocialArea: () => <div data-testid="mock-social-area" />,
}));
vi.mock("../Layouts/SpreadsheetArea", () => ({
  SpreadsheetArea: () => <div data-testid="mock-spreadsheet-area" />,
}));
vi.mock("../Layouts/TaskBoardArea", () => ({
  TaskBoardArea: () => <div data-testid="mock-taskboard-area" />,
}));
vi.mock("../Layouts/TerminalArea", () => ({
  TerminalArea: () => <div data-testid="mock-terminal-area" />,
}));
vi.mock("../Layouts/TextBlock", () => ({
  TextBlock: () => <div data-testid="mock-text-block" />,
}));
vi.mock("../SectionParts/Incrementer", () => ({
  Incrementer: () => <div data-testid="mock-incrementer" />,
}));
vi.mock("./MetaControlMenuButton", () => ({
  MetaControlMenuButton: () => <div data-testid="mock-meta-control-menu" />,
}));
vi.mock("./TextBlockMetaControlMenuButton", () => ({
  TextBlockMetaControlMenuButton: () => (
    <div data-testid="mock-textblock-meta-control-menu" />
  ),
}));

describe("SectionContainerCoreResizable", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      projectChatWindowing: createProjectChatWindowingState(),
    };
    mockCanvasState.activeSectionId = null;
    mockCanvasState.graphSurfaceImplementation = "legacy-dom";
    mockCanvasState.viewportInteractionActive = false;
  });

  it("keeps the canvas placeholder for hidden external non-chat section bindings", () => {
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            isClosed: true,
            isMinimized: false,
          },
        },
      }),
    };

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-testid="section-canvas-window-placeholder"');
    expect(markup).toContain('data-instance-id="project-chat-window-1"');
    expect(markup).not.toContain('data-testid="mock-code-area"');
  });

  it("routes workspace section windows through the section-owned surface id", () => {
    const markup = renderToStaticMarkup(
      <AreaSwitch
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Chat}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
        chatHost={ChatWindowPlacementEnum.floating}
        chatModeOverride={ChatWindowModeEnum.section_mode}
      />,
    );

    expect(markup).toContain('data-testid="mock-unified-chat-surface"');
    expect(markup).toContain('data-mode="section_mode"');
    expect(markup).toContain('data-host="floating"');
    expect(markup).toContain('data-section-id="section-123"');
    expect(markup).toContain(
      `data-surface-id="${buildWorkspaceSectionProjectChatSurfaceId("project-1", "section-123")}"`,
    );
    expect(markup).toContain('data-project-chat-id=""');
    expect(markup).toContain('data-project-chat-controlled="false"');
  });

  it("preserves explicit standalone thread ownership overrides", () => {
    const markup = renderToStaticMarkup(
      <AreaSwitch
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Chat}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
        chatHost="standalone_page"
        chatModeOverride={ChatWindowModeEnum.section_mode}
        projectChatSurfaceId="standalone-window-space:project-1:space-1:window-1"
        projectChatId="saved-thread"
        setProjectChatId={() => {}}
      />,
    );

    expect(markup).toContain('data-host="standalone_page"');
    expect(markup).toContain(
      'data-surface-id="standalone-window-space:project-1:space-1:window-1"',
    );
    expect(markup).toContain('data-project-chat-id="saved-thread"');
    expect(markup).toContain('data-project-chat-controlled="true"');
  });

  it("hides shared param-codeobj bodies during viewport interaction on the canvas path", () => {
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__rotaryParamCodeObjDefault"
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).toContain('style="display:none"');
    expect(markup).not.toContain('data-testid="mock-code-area"');
  });

  it("hides shared shell bodies during viewport interaction on the canvas path", () => {
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__callableSectionDefault"
        sectionTypeName={SectionTypeEnum.Callable}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).toContain('style="display:none"');
    expect(markup).not.toContain('data-testid="mock-callable-area"');
  });

  it("hides shared resting-text bodies during viewport interaction on the canvas path", () => {
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__browserSectionDefault"
        sectionTypeName={SectionTypeEnum.Browser}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).toContain('style="display:none"');
    expect(markup).not.toContain('data-testid="mock-browser-area"');
  });

  it("keeps the active shared shell body visible during viewport interaction", () => {
    mockCanvasState.activeSectionId = "settings-section__callableSectionDefault";
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__callableSectionDefault"
        sectionTypeName={SectionTypeEnum.Callable}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).not.toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).not.toContain('style="display:none"');
    expect(markup).toContain('data-testid="mock-callable-area"');
  });

  it("keeps the active shared resting-text body visible during viewport interaction", () => {
    mockCanvasState.activeSectionId = "settings-section__browserSectionDefault";
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__browserSectionDefault"
        sectionTypeName={SectionTypeEnum.Browser}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).not.toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).not.toContain('style="display:none"');
    expect(markup).toContain('data-testid="mock-browser-area"');
  });

  it("keeps the active shared param-codeobj body visible during viewport interaction", () => {
    mockCanvasState.activeSectionId = "settings-section__rotaryParamCodeObjDefault";
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__rotaryParamCodeObjDefault"
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).not.toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).not.toContain('style="display:none"');
    expect(markup).toContain('data-testid="mock-code-area"');
  });

  it("hides shared settings dropdown bodies during viewport interaction on the canvas path", () => {
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__backend"
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).toContain('style="display:none"');
    expect(markup).not.toContain('data-testid="mock-code-area"');
  });

  it("keeps the active shared settings dropdown body visible during viewport interaction", () => {
    mockCanvasState.activeSectionId = "settings-section__backend";
    mockCanvasState.graphSurfaceImplementation = "canvas-shell-underlay";
    mockCanvasState.viewportInteractionActive = true;

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="settings-section__backend"
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-canvas-owned-motion-body-root="true"');
    expect(markup).not.toContain('data-canvas-owned-motion-body-hidden="true"');
    expect(markup).not.toContain('style="display:none"');
    expect(markup).toContain('data-testid="mock-code-area"');
  });
});
