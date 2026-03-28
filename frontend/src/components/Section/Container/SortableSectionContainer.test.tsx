import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";
import { SortableSectionContainer } from "./SortableSectionContainer";

const mockUseSortable = vi.fn();

vi.mock("forks/dnd-kit/adapter", () => ({
  useSortable: (...args: unknown[]) => mockUseSortable(...args),
}));

vi.mock("forks/dnd-kit/adapter/zoom", () => ({
  applyZoomToTransform: <T,>(transform: T) => transform,
  transformToString: () => "",
}));

vi.mock("forks/dnd-kit/dndState", () => ({
  isTempSection: () => false,
  useDndState: (
    selector: (state: { overId: string | null; isSorting: boolean }) => unknown,
  ) =>
    selector({
      overId: null,
      isSorting: false,
    }),
}));

vi.mock("forks/dnd-kit/useDndUtils", () => ({
  useDndProps: () => ({
    id: "sortable-section-1",
  }),
}));

vi.mock("state/actions/edgeHandles", () => ({
  scheduleEdgeHandlePositionUpdate: vi.fn(),
}));

vi.mock("./SortableSectionBody", () => ({
  SortableSectionBody: ({
    sectionId,
    listeners,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    listeners: Record<string, unknown>;
    SectionBoundary: (
      props: SortableSectionBodySectionBoundaryProps,
    ) => ReactNode;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (props: {
      sectionId: string;
      isGroup: boolean;
      layoutVariant: "default" | "tight";
      isJoinedCodeTerminalGroup: boolean;
    }) => ReactNode;
  }) => (
    <div
      data-testid="mock-sortable-section-body"
      data-section-id={sectionId}
      data-has-listeners={listeners ? "true" : "false"}
    >
      <SectionBoundary
        sectionId={sectionId}
        dragListeners={listeners}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />
    </div>
  ),
}));

vi.mock("./SortableSectionSection", () => ({
  SortableSectionSection: ({
    sectionId,
    dragListeners,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    dragListeners?: Record<string, unknown>;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-sortable-section-section"
      data-section-id={sectionId}
      data-has-drag-listeners={dragListeners ? "true" : "false"}
    >
      {renderCoreBody({
        sectionId,
        sectionTypeName: "Code",
        bgColor: "bg:white",
        isMinimized: false,
        isUserView: false,
      })}
      {renderNestedSections({
        sectionId,
        isGroup: false,
        layoutVariant: "tight",
        isJoinedCodeTerminalGroup: false,
      })}
    </div>
  ),
}));

describe("SortableSectionContainer", () => {
  beforeEach(() => {
    mockUseSortable.mockReturnValue({
      attributes: {},
      listeners: { onPointerDown: "listener" },
      setNodeRef: () => undefined,
      transform: null,
      transition: undefined,
      overIndex: null,
      items: [],
      isDragging: false,
    });
  });

  it("owns the lifted sortable section boundary while passing the standard nested-sections renderer through the sortable body seam", () => {
    const renderCoreBody = ({
      sectionId,
      sectionTypeName,
      bgColor,
    }: SectionContainerCoreBodyProps) => (
      <div
        data-testid="mock-section-container-core-body"
        data-section-id={sectionId}
        data-section-type={sectionTypeName}
        data-bg-color={bgColor}
      />
    );
    const renderNestedSections = ({
      sectionId,
      layoutVariant,
      isJoinedCodeTerminalGroup,
    }: {
      sectionId: string;
      isGroup: boolean;
      layoutVariant: "default" | "tight";
      isJoinedCodeTerminalGroup: boolean;
    }) => (
      <div
        data-testid="mock-section-container-nested-sections"
        data-section-id={sectionId}
        data-layout-variant={layoutVariant}
        data-is-joined-code-terminal-group={
          isJoinedCodeTerminalGroup ? "true" : "false"
        }
      />
    );
    const markup = renderToStaticMarkup(
      <SortableSectionContainer
        sectionId="section-1"
        className="child-class-name"
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-sortable-section-id="section-1"');
    expect(markup).toContain('data-testid="mock-sortable-section-body"');
    expect(markup).toContain('data-testid="mock-sortable-section-section"');
    expect(markup).toContain('data-has-listeners="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
    expect(markup).toContain("child-class-name");
  });
});
