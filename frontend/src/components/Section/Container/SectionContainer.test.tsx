import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainer } from "./SectionContainer";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

type MockEmbeddedTerminal = {
  isTerminalMinimized: boolean;
  attachedTerminalId: string;
} | null;

type MockImpl = {
  type: string;
  positionAndSizeLocked: boolean;
  isInOtherProjectConfigs: boolean;
  isMinimized: boolean;
  metaControlStyle: boolean;
};

type MockProjectState = {
  projectConfig: {
    id: string;
  };
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
};
let mockViewVisibility = {
  visibility: true,
  isEditingViewMode: false,
};
let mockViewMode = {
  isUserFacing: false,
};
let mockImpl: MockImpl = {
  type: SectionTypeEnum.Code,
  positionAndSizeLocked: false,
  isInOtherProjectConfigs: false,
  isMinimized: false,
  metaControlStyle: false,
};
let mockEmbeddedTerminal: MockEmbeddedTerminal = null;
let mockHasPythonCodegen = true;
let mockPythonTarget: { generateMetadata?: boolean } | null = null;
let mockActiveSectionIds = new Set<string>();

vi.mock("forks/xyflow/core/contexts/NodeIdContext", () => ({
  NodeIdProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getActiveViewModeConfig: () => mockViewMode,
  getCurrEffectiveSectionImpl: () => mockImpl,
  getEmbeddedAttachedTerminalForCodeSection: () => mockEmbeddedTerminal,
  getSectionShouldRender: (visibility: boolean, isEditingViewMode: boolean) =>
    visibility || isEditingViewMode,
  getSectionViewModeVisibility: () => mockViewVisibility,
  isBaseCodeSectionType: (sectionTypeName: string) =>
    sectionTypeName === SectionTypeEnum.Code,
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: (sectionId: string) =>
    mockActiveSectionIds.has(sectionId),
}));

vi.mock("utils/codegenTargets", () => ({
  getPythonCodegenTarget: () => mockPythonTarget,
  projectConfigHasPythonCodegen: () => mockHasPythonCodegen,
}));

vi.mock("./ContainerSwitch", () => ({
  ContainerSwitch: ({
    children,
    isTopLevel,
    visibility,
    isEditingViewMode,
    isUserView,
  }: {
    children: ReactNode;
    isTopLevel: boolean;
    visibility: boolean;
    isEditingViewMode: boolean;
    isUserView: boolean;
  }) => (
    <div
      data-testid="mock-container-switch"
      data-is-top-level={isTopLevel ? "true" : "false"}
      data-visibility={visibility ? "true" : "false"}
      data-is-editing-view-mode={isEditingViewMode ? "true" : "false"}
      data-is-user-view={isUserView ? "true" : "false"}
    >
      {children}
    </div>
  ),
}));

vi.mock("./SectionContainerCore", () => ({
  SectionContainerCore: ({
    sectionId,
    isUserView,
    sectionTypeName,
    bgColor,
    forceHideOutline = false,
    hideAgenticEdgeHandles = false,
    omitAgenticHandleScopeClass = false,
    joinedCorners = "none",
    children,
  }: {
    sectionId: string;
    isUserView: boolean;
    sectionTypeName: string;
    bgColor: string;
    forceHideOutline?: boolean;
    hideAgenticEdgeHandles?: boolean;
    omitAgenticHandleScopeClass?: boolean;
    joinedCorners?: string;
    children: ReactNode;
  }) => (
    <div
      data-testid="mock-section-container-core"
      data-section-id={sectionId}
      data-is-user-view={isUserView ? "true" : "false"}
      data-section-type={sectionTypeName}
      data-bg-color={bgColor}
      data-force-hide-outline={forceHideOutline ? "true" : "false"}
      data-hide-agentic-edge-handles={hideAgenticEdgeHandles ? "true" : "false"}
      data-omit-agentic-handle-scope-class={
        omitAgenticHandleScopeClass ? "true" : "false"
      }
      data-joined-corners={joinedCorners}
    >
      {children}
    </div>
  ),
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
      data-testid="mock-section-container-core-body"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-bg-color={bgColor}
      data-is-minimized={isMinimized ? "true" : "false"}
      data-is-user-view={isUserView ? "true" : "false"}
    />
  ),
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: ({ isUserView }: { isUserView: boolean }) => (
    <div
      data-testid="mock-agentic-edge-handles"
      data-is-user-view={isUserView ? "true" : "false"}
    />
  ),
}));

vi.mock("./utils", () => ({
  getBgColor: (sectionTypeName: string) => `bg:${sectionTypeName}`,
  getOutlineColor: () => "mock-outline",
}));

function renderNestedSections({
  sectionId,
  isGroup,
  layoutVariant,
  isJoinedCodeTerminalGroup,
}: SectionContainerNestedSectionsProps) {
  return (
    <div
      data-testid="mock-section-container-nested-sections"
      data-section-id={sectionId}
      data-is-group={isGroup ? "true" : "false"}
      data-layout-variant={layoutVariant}
      data-is-joined-code-terminal-group={
        isJoinedCodeTerminalGroup ? "true" : "false"
      }
    />
  );
}

describe("SectionContainer", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
    };
    mockViewVisibility = {
      visibility: true,
      isEditingViewMode: false,
    };
    mockViewMode = {
      isUserFacing: false,
    };
    mockImpl = {
      type: SectionTypeEnum.Code,
      positionAndSizeLocked: false,
      isInOtherProjectConfigs: false,
      isMinimized: false,
      metaControlStyle: false,
    };
    mockEmbeddedTerminal = null;
    mockHasPythonCodegen = true;
    mockPythonTarget = null;
    mockActiveSectionIds = new Set<string>();
  });

  it("builds the core body boundary in the standard code-section branch", () => {
    const markup = renderToStaticMarkup(
      <SectionContainer
        sectionId="section-1"
        isTopLevel={false}
        dragListeners={undefined}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-core"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain(`data-section-type="${SectionTypeEnum.Code}"`);
    expect(markup).toContain('data-bg-color="bg:Code"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
  });

  it("keeps the joined code-terminal wrapper and passes the lifted body through the joined core branch", () => {
    mockEmbeddedTerminal = {
      isTerminalMinimized: false,
      attachedTerminalId: "terminal-1",
    };
    mockActiveSectionIds = new Set(["terminal-1"]);

    const markup = renderToStaticMarkup(
      <SectionContainer
        sectionId="section-2"
        isTopLevel={true}
        dragListeners={undefined}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain("data-joined-code-terminal-group");
    expect(markup).toContain('data-testid="mock-agentic-edge-handles"');
    expect(markup).toContain('data-force-hide-outline="true"');
    expect(markup).toContain('data-hide-agentic-edge-handles="true"');
    expect(markup).toContain('data-omit-agentic-handle-scope-class="true"');
    expect(markup).toContain('data-joined-corners="code-terminal-parent"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-is-joined-code-terminal-group="true"');
  });
});
