import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { SectionCanvasBody } from "./SectionCanvasBody";

type MockProjectState = {
  projectConfig: {
    id: string;
  };
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
};

let mockBenchmark = {
  active: false,
  stage: "full" as const,
  renderSectionHeader: true,
  renderSectionBody: true,
  renderFullSectionBody: true,
  renderStaticParamList: false,
  renderSectionHandles: true,
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
  projectChatWindowing: createProjectChatWindowingState(),
};

vi.mock("components/Pages/Project/settingsAllSettingsBenchmark", () => ({
  useSettingsAllSettingsBenchmark: () => mockBenchmark,
}));

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
  DictArea: ({
    sectionId,
  }: {
    sectionId: string;
  }) => (
    <div data-testid="mock-live-dict-area-layout">
      live-dict:{sectionId}
    </div>
  ),
}));
vi.mock("../Layouts/SettingsAllSettingsBenchmarkDictArea", () => ({
  SettingsAllSettingsBenchmarkDictArea: ({
    sectionId,
  }: {
    sectionId: string;
  }) => (
    <div data-testid="mock-benchmark-dict-area">benchmark-dict:{sectionId}</div>
  ),
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
    mockBenchmark = {
      active: false,
      stage: "full",
      renderSectionHeader: true,
      renderSectionBody: true,
      renderFullSectionBody: true,
      renderStaticParamList: false,
      renderSectionHandles: true,
    };
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      projectChatWindowing: createProjectChatWindowingState(),
    };
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
      <SectionContainerCoreCanvasBody
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Code}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-testid="section-canvas-window-placeholder"');
    expect(markup).toContain('data-instance-id="project-chat-window-1"');
    expect(markup).not.toContain('data-testid="mock-code-area"');
  });

  it("renders children inside the resizable shell after lifting the core body boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerCoreResizable
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Code}
        bgColor="bg-setta-50"
        isInOtherProjectConfigs={false}
        isUserView={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
        textBlockMetaControlStyle={false}
      >
        <div data-testid="mock-core-body">body:section-123</div>
      </SectionContainerCoreResizable>,
    );

    expect(markup).toContain('data-testid="mock-core-body"');
    expect(markup).toContain("body:section-123");
  });

  it("routes chat sections through the section-owned surface id on the section layout host", () => {
    const markup = renderToStaticMarkup(
      <SectionCanvasBody
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Chat}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-unified-chat-surface"');
    expect(markup).toContain('data-host="section_layout"');
    expect(markup).toContain('data-section-id="section-123"');
    expect(markup).toContain(
      `data-surface-id="${buildWorkspaceSectionProjectChatSurfaceId("project-1", "section-123")}"`,
    );
    expect(markup).toContain('data-project-chat-id=""');
    expect(markup).toContain('data-project-chat-controlled="false"');
  });

  it("suppresses minimized section bodies that stay on the main canvas", () => {
    const markup = renderToStaticMarkup(
      <SectionCanvasBody
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Code}
        bgColor="bg-setta-50"
        isMinimized={true}
        isUserView={false}
      />,
    );

    expect(markup).toBe("");
  });

  it("routes dict sections through the live dict layout outside the reduced benchmark shell", () => {
    const markup = renderToStaticMarkup(
      <SectionCanvasBody
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Dict}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-live-dict-area-layout"');
    expect(markup).toContain("live-dict:section-123");
    expect(markup).not.toContain('data-testid="mock-benchmark-dict-area"');
  });

  it("routes dict sections through the benchmark shell when the benchmark disables the full body", () => {
    mockBenchmark = {
      active: true,
      stage: "section-body-shell",
      renderSectionHeader: true,
      renderSectionBody: true,
      renderFullSectionBody: false,
      renderStaticParamList: false,
      renderSectionHandles: false,
    };

    const markup = renderToStaticMarkup(
      <SectionCanvasBody
        sectionId="section-123"
        sectionTypeName={SectionTypeEnum.Dict}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-benchmark-dict-area"');
    expect(markup).toContain("benchmark-dict:section-123");
    expect(markup).not.toContain('data-testid="mock-live-dict-area-layout"');
  });
});
