import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCore } from "./SectionContainerCore";

type MockSectionImpl = {
  type: SectionType;
  isInOtherProjectConfigs: boolean;
  positionAndSizeLocked: boolean;
  metaControlStyle: boolean;
  isMinimized: boolean;
  styleColor: string | null;
};

type MockProjectState = {
  projectConfig: {
    id: string;
  };
};

const mockState = vi.hoisted(() => ({
  bareSurfaceProps: [] as Array<Record<string, unknown>>,
  resizableProps: [] as Array<Record<string, unknown>>,
  impl: {
    type: "Code",
    isInOtherProjectConfigs: false,
    positionAndSizeLocked: false,
    metaControlStyle: false,
    isMinimized: false,
    styleColor: null,
  } as MockSectionImpl,
  projectState: {
    projectConfig: {
      id: "project-1",
    },
  } as MockProjectState,
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { viewportInteractionActive: boolean }) => unknown,
  ) => selector({ viewportInteractionActive: false }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getAttachedTerminalParentIdForTerminalSection: () => null,
  getCurrEffectiveSectionImpl: () => mockState.impl,
  getEmbeddedAttachedTerminalParentIdForTerminalSection: () => null,
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: () => false,
}));

vi.mock("state/definitions", () => ({
  useAgenticScopeHighlights: (
    selector: (state: {
      readSectionIdsByProjectConfigId: Record<string, Record<string, boolean>>;
      writeSectionIdsByProjectConfigId: Record<string, Record<string, boolean>>;
    }) => unknown,
  ) =>
    selector({
      readSectionIdsByProjectConfigId: {},
      writeSectionIdsByProjectConfigId: {},
    }),
  useLocalStorage: (selector: (state: { darkMode: boolean }) => unknown) =>
    selector({ darkMode: false }),
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockState.projectState),
  useTemporaryMiscState: (
    selector: (state: Record<string, unknown>) => unknown,
  ) => selector({}),
}));

vi.mock("state/hooks/sectionRef", () => ({
  useSectionRefAndInit: () => null,
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: () => <div data-testid="mock-agentic-edge-handles" />,
}));

vi.mock("./BareSectionNodeSurface", () => ({
  BareSectionNodeSurface: (props: Record<string, unknown>) => {
    mockState.bareSurfaceProps.push(props);
    return (
      <div
        data-testid="mock-bare-section-node-surface"
        data-section-id={String(props.sectionId)}
        data-is-minimized={String(props.isMinimized)}
      />
    );
  },
}));

vi.mock("./ChatSharedEdgeHandles", () => ({
  ChatSharedEdgeHandles: () => <div data-testid="mock-chat-edge-handles" />,
}));

vi.mock("./MinimizedDataEdgeHandles", () => ({
  MinimizedDataEdgeHandles: ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-minimized-data-edge-handles"
      data-section-id={sectionId}
    />
  ),
}));

vi.mock("./sectionChrome", () => ({
  getSectionContainerShellClassName: () => "mock-section-shell",
}));

vi.mock("./SectionContainerCoreResizabe", () => ({
  SectionContainerCoreResizable: (props: Record<string, unknown>) => {
    mockState.resizableProps.push(props);
    return (
      <div
        data-testid="mock-section-container-core-resizable"
        data-section-id={String(props.sectionId)}
      />
    );
  },
}));

vi.mock("./StateMachineEdgeHandles", () => ({
  StateMachineEdgeHandles: () => (
    <div data-testid="mock-state-machine-edge-handles" />
  ),
}));

vi.mock("./utils", () => ({
  getBgColor: () => "bg-setta-50",
  getOnSectionClick: () => () => undefined,
  useAiSectionHighlight: () => false,
}));

function renderSectionContainerCore(sectionTypeName: SectionType) {
  mockState.impl = {
    ...mockState.impl,
    type: sectionTypeName,
  };
  return renderToStaticMarkup(
    <SectionContainerCore sectionId="section-1" isUserView={false} />,
  );
}

describe("SectionContainerCore", () => {
  beforeEach(() => {
    mockState.bareSurfaceProps = [];
    mockState.resizableProps = [];
    mockState.impl = {
      type: SectionTypeEnum.Code,
      isInOtherProjectConfigs: false,
      positionAndSizeLocked: false,
      metaControlStyle: false,
      isMinimized: false,
      styleColor: null,
    };
  });

  it.each([SectionTypeEnum.Callable, SectionTypeEnum.Dict])(
    "routes %s canvas sections through the dedicated bare surface",
    (sectionTypeName) => {
      const markup = renderSectionContainerCore(sectionTypeName);

      expect(markup).toContain('data-testid="mock-bare-section-node-surface"');
      expect(markup).not.toContain(
        'data-testid="mock-section-container-core-resizable"',
      );
      expect(mockState.bareSurfaceProps).toHaveLength(1);
      expect(mockState.bareSurfaceProps[0]).toMatchObject({
        sectionId: "section-1",
        sectionTypeName,
        bgColor: "bg-setta-50",
        isMinimized: false,
      });
      expect(mockState.resizableProps).toHaveLength(0);
    },
  );

  it("passes minimized state into the bare surface so it can defer to shared edge dots", () => {
    mockState.impl.isMinimized = true;
    const markup = renderSectionContainerCore(SectionTypeEnum.Callable);

    expect(markup).toContain('data-is-minimized="true"');
    expect(mockState.bareSurfaceProps[0]).toMatchObject({
      isMinimized: true,
    });
  });

  it("keeps non-bare canvas sections on the resizable chrome path", () => {
    const markup = renderSectionContainerCore(SectionTypeEnum.Code);

    expect(markup).toContain(
      'data-testid="mock-section-container-core-resizable"',
    );
    expect(markup).not.toContain(
      'data-testid="mock-bare-section-node-surface"',
    );
    expect(mockState.resizableProps).toHaveLength(1);
    expect(mockState.resizableProps[0]).toMatchObject({
      sectionId: "section-1",
      sectionTypeName: SectionTypeEnum.Code,
    });
  });
});
