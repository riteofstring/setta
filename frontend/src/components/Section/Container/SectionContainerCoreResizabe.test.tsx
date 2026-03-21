import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
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
import { SectionAreaSwitch } from "./SectionAreaSwitch";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

type MockProjectState = {
  projectConfig: {
    id: string;
  };
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
};

type MockReactFlowState = {
  viewportInteractionActive: boolean;
  transform: [number, number, number];
};

type MockNodeInternalsState = {
  x: Map<string, { width: number | null; height: number | null }>;
};

let mockSectionImpl: {
  type: string;
  isMinimized: boolean;
  metaControlStyle: boolean;
} = {
  type: SectionTypeEnum.Code,
  isMinimized: false,
  metaControlStyle: false,
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
  projectChatWindowing: createProjectChatWindowingState(),
};

let mockReactFlowState: MockReactFlowState = {
  viewportInteractionActive: false,
  transform: [0, 0, 1],
};

let mockNodeInternalsState: MockNodeInternalsState = {
  x: new Map([["section-123", { width: 200, height: 100 }]]),
};

let mockIsRoot = false;
let mockIsActiveSection = false;
let mockSectionHeaderProps: Record<string, unknown> | null = null;

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
    surfaceClassName = "",
    useMetaControlStyle = false,
  }: {
    children: ReactNode;
    surfaceClassName?: string;
    useMetaControlStyle?: boolean;
  }) => (
    <section
      data-testid="mock-custom-resizable"
      data-surface-class={surfaceClassName}
      data-meta-control-style={useMetaControlStyle ? "true" : "false"}
    >
      {children}
    </section>
  ),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => mockSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection: () => null,
}));

vi.mock("state/actions/uiTypes/utils", () => ({
  getIsRoot: () => mockIsRoot,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
  useNodeInternals: (selector: (state: MockNodeInternalsState) => unknown) =>
    selector(mockNodeInternalsState),
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (selector: (state: MockReactFlowState) => unknown) =>
    selector(mockReactFlowState),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: () => mockIsActiveSection,
}));

vi.mock("../Header/SectionHeader", () => ({
  SectionHeader: (props: Record<string, unknown>) => {
    mockSectionHeaderProps = props;
    return (
      <header
        data-testid="mock-section-header"
        data-show-section-container-controls={
          props.showSectionContainerControls === false ? "false" : "true"
        }
        data-has-extra-controls={props.extraControls ? "true" : "false"}
      />
    );
  },
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
    mockSectionImpl = {
      type: SectionTypeEnum.Code,
      isMinimized: false,
      metaControlStyle: false,
    };
    mockIsRoot = false;
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      projectChatWindowing: createProjectChatWindowingState(),
    };
    mockReactFlowState = {
      viewportInteractionActive: false,
      transform: [0, 0, 1],
    };
    mockNodeInternalsState = {
      x: new Map([["section-123", { width: 200, height: 100 }]]),
    };
    mockIsActiveSection = false;
    mockSectionHeaderProps = null;
  });

  it("keeps the canvas placeholder for hidden external non-chat section bindings", () => {
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
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

  it("keeps the canvas placeholder for minimized external non-chat section bindings", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Code,
      isMinimized: true,
      metaControlStyle: false,
    };
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
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
      <SectionAreaSwitch
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

  it("routes meta-control canvas chrome through the shared grid descriptor", () => {
    mockSectionImpl = {
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

    expect(markup).toContain('data-testid="mock-meta-control-menu"');
    expect(markup).not.toContain('data-testid="mock-section-header"');
    expect(markup).toContain('data-meta-control-style="true"');
    expect(markup).toContain('data-surface-class="bg-transparent');
    expect(markup).toContain("group-hover/card-section:z-[170]");
    expect(markup).toContain("grid");
    expect(markup).toContain("grid-cols-1");
    expect(markup).not.toContain("section-grid-cols");
  });

  it("routes standard canvas chrome through the shared section grid shell", () => {
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

    expect(markup).toContain('data-testid="mock-section-header"');
    expect(markup).toContain('data-testid="mock-code-area"');
    expect(markup).toContain("section-grid-cols");
  });

  it("trims inactive tier 1 secondary header chrome while the viewport is moving", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.Dict,
      isMinimized: false,
      metaControlStyle: false,
    };
    mockReactFlowState = {
      viewportInteractionActive: true,
      transform: [0, 0, 0.85],
    };

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Dict}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-header"');
    expect(markup).toContain('data-show-section-container-controls="false"');
    expect(markup).toContain('data-has-extra-controls="false"');
    expect(mockSectionHeaderProps?.showSectionContainerControls).toBe(false);
  });

  it("keeps root incrementers inside the same shared grid canvas shell", () => {
    mockIsRoot = true;

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

    expect(markup).toContain('data-testid="mock-section-header"');
    expect(markup).toContain('data-testid="mock-incrementer"');
    expect(markup).toContain('data-testid="mock-code-area"');
    expect(markup).toContain("section-grid-cols");
  });

  it("keeps text-block meta-control menus even when the normal header is hidden", () => {
    mockSectionImpl = {
      type: SectionTypeEnum.TextBlock,
      isMinimized: false,
      metaControlStyle: true,
    };

    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.TextBlock}
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
        hideHeader
      />,
    );

    expect(markup).toContain('data-testid="mock-textblock-meta-control-menu"');
    expect(markup).not.toContain('data-testid="mock-section-header"');
    expect(markup).toContain('data-meta-control-style="true"');
    expect(markup).toContain("section-grid-cols");
  });

  it("preserves explicit standalone thread ownership overrides", () => {
    const markup = renderToStaticMarkup(
      <SectionAreaSwitch
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
