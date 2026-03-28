import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerArea } from "./SectionContainerArea";

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: () => <div data-testid="mock-unified-chat-surface" />,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: object) => unknown) =>
    selector({
      projectConfig: { id: "project-1" },
      projectChatWindowing: {},
    }),
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
vi.mock("../Layouts/CodeArea", () => ({
  CodeArea: () => <div data-testid="mock-code-area" />,
  GenPythonCodeArea: () => <div data-testid="mock-gen-python-code-area" />,
  GenPythonMetadataArea: () => (
    <div data-testid="mock-gen-python-metadata-area" />
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
vi.mock("../Layouts/StateMachineNodeArea", () => ({
  StateMachineNodeArea: () => <div data-testid="mock-state-machine-node-area" />,
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
vi.mock("./SectionContainerAreaDictBoundary", () => ({
  SectionContainerAreaDictBoundary: ({
    sectionId,
    bgColor,
  }: {
    sectionId: string;
    bgColor: string;
  }) => (
    <div
      data-testid="mock-section-container-dict-area"
      data-section-id={sectionId}
      data-bg-color={bgColor}
    />
  ),
}));

describe("SectionContainerArea", () => {
  it("routes dict sections through the dedicated dict-area boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerArea
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Dict}
        bgColor="bg-setta-50"
        isMinimized={false}
        isUserView={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-dict-area"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-bg-color="bg-setta-50"');
  });
});
