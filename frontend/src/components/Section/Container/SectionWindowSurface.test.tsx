import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionWindowSurface } from "./SectionWindowSurface";

type MockProjectState = {
  projectConfig: {
    activeIds: string[];
  };
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    activeIds: [],
  },
};

let mockDarkMode = false;
let mockPreviewStyleColor: string | null | undefined = undefined;
let mockSectionImpl = {
  type: SectionTypeEnum.Chat,
  isInOtherProjectConfigs: false,
  isMinimized: false,
  positionAndSizeLocked: false,
  metaControlStyle: false,
  styleColor: null as string | null,
};
let mockSectionContainerShellArgs: Record<string, unknown> | null = null;
let mockSectionSurfaceArgs: Record<string, unknown> | null = null;
let mockBgColor = "bg-setta-50";

vi.mock("state/definitions", () => ({
  useLocalStorage: () => mockDarkMode,
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
  useTemporaryMiscState: () => mockPreviewStyleColor,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => mockSectionImpl,
}));

vi.mock("state/actions/uiTypes/utils", () => ({
  getIsRoot: () => false,
}));

vi.mock("../Header/SectionHeader", () => ({
  SectionHeader: ({
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
}));

vi.mock("./SectionContainerCoreResizabe", () => ({
  AreaSwitch: ({
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
}));

vi.mock("./sectionChrome", () => ({
  getSectionContainerShellClassName: (args: Record<string, unknown>) => {
    mockSectionContainerShellArgs = args;
    return "mock-section-container-shell";
  },
  getSectionSurfaceClassName: (args: Record<string, unknown>) => {
    mockSectionSurfaceArgs = args;
    return "mock-section-surface";
  },
}));

vi.mock("./utils", () => ({
  getBgColor: () => mockBgColor,
}));

describe("SectionWindowSurface", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        activeIds: ["section-1"],
      },
    };
    mockDarkMode = false;
    mockPreviewStyleColor = undefined;
    mockSectionImpl = {
      type: SectionTypeEnum.Chat,
      isInOtherProjectConfigs: false,
      isMinimized: false,
      positionAndSizeLocked: false,
      metaControlStyle: false,
      styleColor: null,
    };
    mockSectionContainerShellArgs = null;
    mockSectionSurfaceArgs = null;
    mockBgColor = "bg-setta-50";
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

  it("uses standalone chrome and style preview variables when a window surface is rendered on its own page", () => {
    mockDarkMode = true;
    mockPreviewStyleColor = "#245c85";
    mockSectionImpl.styleColor = "#dbeafe";

    const markup = renderToStaticMarkup(
      <SectionWindowSurface
        sectionId="section-1"
        headerActions={null}
        roundedClassName="rounded-lg"
        chatHost="standalone_page"
      />,
    );

    expect(mockSectionContainerShellArgs).toMatchObject({
      hideBorder: true,
      cornerClassName: "rounded-none",
      hasSectionStyleTheme: true,
      useMetaControlStyle: false,
    });
    expect(mockSectionSurfaceArgs).toMatchObject({
      bgColor: "bg-setta-50",
      cornerClassName: "rounded-none",
      hasSectionStyleTheme: true,
      hideFrameBorder: true,
    });
    expect(markup).toContain('style="--setta-section-style-bg:');
    expect(markup).toContain("--setta-section-style-text:");
    expect(markup).toContain('data-chat-host="standalone_page"');
  });
});
