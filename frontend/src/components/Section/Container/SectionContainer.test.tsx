import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainer } from "./SectionContainer";

type MockProjectState = {
  projectConfig: {
    activeIds: string[];
  };
};

type MockSectionViewState = {
  visibility: boolean;
  isEditingViewMode: boolean;
  sectionType: SectionType;
  isUserFacing: boolean;
  positionAndSizeLocked: boolean;
  isInOtherProjectConfigs: boolean;
  embeddedTerminal: {
    attachedTerminalId: string;
    isTerminalMinimized: boolean;
  } | null;
  hasPythonCodegen: boolean;
  hasMetadata: boolean;
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    activeIds: [],
  },
};

let mockSectionViewState: MockSectionViewState = {
  visibility: true,
  isEditingViewMode: false,
  sectionType: SectionTypeEnum.Code,
  isUserFacing: false,
  positionAndSizeLocked: false,
  isInOtherProjectConfigs: false,
  embeddedTerminal: null,
  hasPythonCodegen: true,
  hasMetadata: true,
};

const activeSectionIds = new Set<string>();

vi.mock("gpuFlow/NodeIdContext", () => ({
  NodeIdContext: {
    Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: (sectionId: string) => activeSectionIds.has(sectionId),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getActiveViewModeConfig: () => ({
    isUserFacing: mockSectionViewState.isUserFacing,
  }),
  getCurrEffectiveSectionImpl: () => ({
    type: mockSectionViewState.sectionType,
    positionAndSizeLocked: mockSectionViewState.positionAndSizeLocked,
    isInOtherProjectConfigs: mockSectionViewState.isInOtherProjectConfigs,
  }),
  getEmbeddedAttachedTerminalForCodeSection: () =>
    mockSectionViewState.embeddedTerminal,
  getSectionShouldRender: (visibility: boolean, _isEditingViewMode: boolean) =>
    visibility,
  getSectionViewModeVisibility: () => ({
    visibility: mockSectionViewState.visibility,
    isEditingViewMode: mockSectionViewState.isEditingViewMode,
  }),
  isBaseCodeSectionType: (sectionType: SectionType) =>
    sectionType === SectionTypeEnum.Code ||
    sectionType === SectionTypeEnum.GenPythonCode ||
    sectionType === SectionTypeEnum.GenPythonMetadata,
}));

vi.mock("utils/codegenTargets", () => ({
  getPythonCodegenTarget: () => ({
    generateMetadata: mockSectionViewState.hasMetadata,
  }),
  projectConfigHasPythonCodegen: () => mockSectionViewState.hasPythonCodegen,
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: ({ isUserView }: { isUserView: boolean }) => (
    <div
      data-testid="mock-agentic-edge-handles"
      data-is-user-view={String(isUserView)}
    />
  ),
}));

vi.mock("./ContainerWrappers", () => ({
  GpuSceneSectionContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-gpu-scene-section-container">{children}</div>
  ),
}));

vi.mock("./SectionContainerCore", () => ({
  SectionContainerCore: ({
    sectionId,
    isUserView,
    forceHideOutline = false,
    hideAgenticEdgeHandles = false,
    omitAgenticHandleScopeClass = false,
    joinedCorners = "",
    fillSurface = false,
    renderParamRows = true,
  }: {
    sectionId: string;
    isUserView: boolean;
    forceHideOutline?: boolean;
    hideAgenticEdgeHandles?: boolean;
    omitAgenticHandleScopeClass?: boolean;
    joinedCorners?: string;
    fillSurface?: boolean;
    renderParamRows?: boolean;
  }) => (
    <div
      data-testid="mock-section-container-core"
      data-section-id={sectionId}
      data-is-user-view={String(isUserView)}
      data-force-hide-outline={String(forceHideOutline)}
      data-hide-agentic-edge-handles={String(hideAgenticEdgeHandles)}
      data-omit-agentic-handle-scope-class={String(omitAgenticHandleScopeClass)}
      data-joined-corners={joinedCorners}
      data-fill-surface={String(fillSurface)}
      data-render-param-rows={String(renderParamRows)}
    />
  ),
}));

vi.mock("./utils", () => ({
  getOutlineColor: ({
    isActiveSection,
    isInOtherProjectConfigs,
  }: {
    isActiveSection: boolean;
    isInOtherProjectConfigs: boolean;
  }) =>
    `outline-${isActiveSection ? "active" : "idle"}-${isInOtherProjectConfigs ? "other" : "current"}`,
}));

describe("SectionContainer", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        activeIds: ["section-1"],
      },
    };
    mockSectionViewState = {
      visibility: true,
      isEditingViewMode: false,
      sectionType: SectionTypeEnum.Code,
      isUserFacing: false,
      positionAndSizeLocked: false,
      isInOtherProjectConfigs: false,
      embeddedTerminal: null,
      hasPythonCodegen: true,
      hasMetadata: true,
    };
    activeSectionIds.clear();
  });

  it("renders embedded-terminal code sections as a single section surface", () => {
    mockSectionViewState.embeddedTerminal = {
      attachedTerminalId: "terminal-1",
      isTerminalMinimized: false,
    };
    activeSectionIds.add("terminal-1");

    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).toContain('data-testid="mock-section-container-core"');
    expect(markup).not.toContain("data-joined-code-terminal-group");
  });

  it("does not render child section DOM for groups", () => {
    mockSectionViewState.sectionType = SectionTypeEnum.Group;

    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).not.toContain('data-testid="mock-section-container-core"');
    expect(markup).toContain('data-testid="mock-gpu-scene-section-container"');
  });

  it("does not activate parent-owned nested content for embedded terminals", () => {
    mockSectionViewState.embeddedTerminal = {
      attachedTerminalId: "terminal-1",
      isTerminalMinimized: false,
    };

    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).toContain('data-testid="mock-section-container-core"');
    expect(markup).not.toContain("data-joined-code-terminal-group");
  });

  it("marks all project section surfaces as scene-owned without nested content ownership", () => {
    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).toContain('data-testid="mock-gpu-scene-section-container"');
    expect(markup).toContain('data-fill-surface="true"');
    expect(markup).toContain('data-render-param-rows="false"');
  });

  it("keeps top-level surfaces scene-owned with retained param rows", () => {
    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel />,
    );

    expect(markup).toContain('data-testid="mock-gpu-scene-section-container"');
    expect(markup).toContain('data-fill-surface="true"');
    expect(markup).toContain('data-render-param-rows="false"');
  });

  it("skips generated python sections when python codegen is unavailable", () => {
    mockSectionViewState.sectionType = SectionTypeEnum.GenPythonCode;
    mockSectionViewState.hasPythonCodegen = false;

    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).toBe("");
  });
});
