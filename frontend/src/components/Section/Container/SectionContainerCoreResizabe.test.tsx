import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  type SectionType,
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

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
  projectChatWindowing: createProjectChatWindowingState(),
};
let mockEffectiveSectionImpl: {
  type: SectionType;
  isMinimized: boolean;
  metaControlStyle: boolean;
} = {
  type: SectionTypeEnum.Code,
  isMinimized: false,
  metaControlStyle: false,
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
  CustomResizable: ({
    children,
    surfaceDecorations,
  }: {
    children: ReactNode;
    surfaceDecorations: {
      layout: string;
      resizeHandleTone: string;
      showTopDragHandle: boolean;
    };
  }) => (
    <section
      data-testid="mock-custom-resizable"
      data-surface-layout={surfaceDecorations.layout}
      data-resize-handle-tone={surfaceDecorations.resizeHandleTone}
      data-show-top-drag-handle={
        surfaceDecorations.showTopDragHandle ? "true" : "false"
      }
    >
      {children}
    </section>
  ),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => mockEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection: () => null,
}));

vi.mock("state/actions/uiTypes/utils", () => ({
  getIsRoot: () => false,
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
    mockEffectiveSectionImpl = {
      type: SectionTypeEnum.Code,
      isMinimized: false,
      metaControlStyle: false,
    };
  });

  it("keeps the canvas placeholder for hidden external non-chat section bindings", () => {
    const closedWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-123",
      isClosed: true,
      isMinimized: false,
    });
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: [closedWindow.instanceId],
        instancesById: {
          [closedWindow.instanceId]: closedWindow,
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

  it("routes meta-control surface decorations through the shared chrome contract", () => {
    mockEffectiveSectionImpl = {
      type: SectionTypeEnum.MetaControl,
      isMinimized: false,
      metaControlStyle: false,
    };

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.MetaControl}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-surface-layout="single-cell"');
    expect(markup).toContain('data-resize-handle-tone="minimal"');
    expect(markup).toContain('data-show-top-drag-handle="true"');
    expect(markup).toContain("cursor-move");
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
});
