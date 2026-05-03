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

vi.mock("./ContainerSwitch", () => ({
  ContainerSwitch: ({
    children,
    sceneSurface = false,
  }: {
    children: ReactNode;
    sceneSurface?: boolean;
  }) => (
    <div
      data-testid="mock-container-switch"
      data-scene-surface={String(sceneSurface)}
    >
      {children}
    </div>
  ),
}));

vi.mock("./ManyNestedSections", () => ({
  MaybeManyNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant = "default",
  }: {
    sectionId: string;
    isGroup: boolean;
    layoutVariant?: "default" | "tight";
  }) => (
    <div
      data-testid="mock-many-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-layout-variant={layoutVariant}
    />
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
    useGpuResizeFrame = false,
  }: {
    sectionId: string;
    isUserView: boolean;
    forceHideOutline?: boolean;
    hideAgenticEdgeHandles?: boolean;
    omitAgenticHandleScopeClass?: boolean;
    joinedCorners?: string;
    fillSurface?: boolean;
    renderParamRows?: boolean;
    useGpuResizeFrame?: boolean;
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
      data-use-gpu-resize-frame={String(useGpuResizeFrame)}
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

  it("renders joined code terminal groups with shared chrome and tight nested layout", () => {
    mockSectionViewState.embeddedTerminal = {
      attachedTerminalId: "terminal-1",
      isTerminalMinimized: false,
    };
    activeSectionIds.add("terminal-1");

    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).toContain("data-joined-code-terminal-group");
    expect(markup).toContain('data-testid="mock-agentic-edge-handles"');
    expect(markup).toContain('data-force-hide-outline="true"');
    expect(markup).toContain('data-hide-agentic-edge-handles="true"');
    expect(markup).toContain('data-joined-corners="code-terminal-parent"');
    expect(markup).toContain('data-layout-variant="tight"');
  });

  it("renders standard sections with default nested layout for groups", () => {
    mockSectionViewState.sectionType = SectionTypeEnum.Group;

    const markup = renderToStaticMarkup(
      <SectionContainer sectionId="section-1" isTopLevel={false} />,
    );

    expect(markup).not.toContain('data-testid="mock-section-container-core"');
    expect(markup).toContain('data-is-group="true"');
    expect(markup).toContain('data-layout-variant="default"');
  });

  it("can render a section surface without parent-owned nested content", () => {
    mockSectionViewState.embeddedTerminal = {
      attachedTerminalId: "terminal-1",
      isTerminalMinimized: false,
    };

    const markup = renderToStaticMarkup(
      <SectionContainer
        sectionId="section-1"
        isTopLevel={false}
        renderNestedContent={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-core"');
    expect(markup).not.toContain("data-joined-code-terminal-group");
    expect(markup).not.toContain('data-testid="mock-many-nested-sections"');
  });

  it("marks GPU scene surfaces as scene-owned without nested content ownership", () => {
    const markup = renderToStaticMarkup(
      <SectionContainer
        sectionId="section-1"
        isTopLevel={false}
        renderNestedContent={false}
        sceneSurface
      />,
    );

    expect(markup).toContain('data-scene-surface="true"');
    expect(markup).toContain('data-fill-surface="true"');
    expect(markup).toContain('data-render-param-rows="false"');
    expect(markup).toContain('data-use-gpu-resize-frame="true"');
    expect(markup).not.toContain('data-testid="mock-many-nested-sections"');
  });

  it("keeps top-level surfaces filled and GPU-resized without scene-owned mode", () => {
    const markup = renderToStaticMarkup(
      <SectionContainer
        sectionId="section-1"
        isTopLevel
        renderNestedContent={false}
      />,
    );

    expect(markup).toContain('data-scene-surface="false"');
    expect(markup).toContain('data-fill-surface="true"');
    expect(markup).toContain('data-render-param-rows="true"');
    expect(markup).toContain('data-use-gpu-resize-frame="true"');
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
