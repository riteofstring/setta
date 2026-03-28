import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
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

vi.mock("./SectionContainerNestedSections", () => ({
  renderSectionContainerNestedSections: ({
    sectionId,
    layoutVariant,
    isJoinedCodeTerminalGroup,
  }: {
    sectionId: string;
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
  ),
}));

vi.mock("./SectionContainerCoreCanvasBody", () => ({
  SectionContainerCoreCanvasBody: ({
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
  ),
}));

vi.mock("./SortableSectionBody", () => ({
  SortableSectionBody: ({
    sectionId,
    listeners,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    listeners: Record<string, unknown>;
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

  it("passes the standard nested-sections renderer through the sortable body boundary", () => {
    const markup = renderToStaticMarkup(
      <SortableSectionContainer
        sectionId="section-1"
        className="child-class-name"
      />,
    );

    expect(markup).toContain('data-sortable-section-id="section-1"');
    expect(markup).toContain('data-testid="mock-sortable-section-body"');
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
