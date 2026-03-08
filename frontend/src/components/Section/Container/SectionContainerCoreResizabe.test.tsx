import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

type MockProjectState = {
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
};

let mockProjectState: MockProjectState = {
  projectChatWindowing: createProjectChatWindowingState(),
};

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
      projectChatWindowing: createProjectChatWindowingState(),
    };
  });

  it("keeps the canvas placeholder for hidden external non-chat section bindings", () => {
    mockProjectState = {
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
});
