import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

vi.mock("./SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
    isTopLevel,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    isTopLevel: boolean;
    SectionBoundary: (
      props: SortableSectionBodySectionBoundaryProps,
    ) => ReactNode;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
    >
      {renderCoreBody({
        sectionId,
        sectionTypeName: "Code",
        bgColor: "bg:blue",
        isMinimized: false,
        isUserView: false,
      })}
      {renderNestedSections({
        sectionId,
        isGroup: true,
        layoutVariant: "default",
        isJoinedCodeTerminalGroup: false,
      })}
      <SectionBoundary
        sectionId="child-a"
        dragListeners={{ onPointerDown: "listener" }}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />
    </div>
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

vi.mock("./SectionContainerNestedSectionsBoundary", () => ({
  renderSectionContainerNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant,
    isJoinedCodeTerminalGroup,
  }: SectionContainerNestedSectionsProps) => (
    <div
      data-testid="mock-section-container-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-layout-variant={layoutVariant}
      data-is-joined-code-terminal-group={String(isJoinedCodeTerminalGroup)}
    />
  ),
}));

vi.mock("./SortableSectionSection", () => ({
  SortableSectionSection: ({
    sectionId,
    dragListeners,
    renderCoreBody,
    renderNestedSections,
  }: SortableSectionBodySectionBoundaryProps) => (
    <div
      data-testid="mock-sortable-section-section"
      data-section-id={sectionId}
      data-has-drag-listeners={String(Boolean(dragListeners))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
}));

describe("SectionContainerBoundary", () => {
  it("injects the default core-body, sortable section boundary, and nested-sections renderer into the generic section container", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary sectionId="section-1" isTopLevel={true} />,
    );

    expect(markup).toContain('data-testid="mock-section-container"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-testid="mock-sortable-section-section"');
    expect(markup).toContain('data-section-id="child-a"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(markup).toContain('data-layout-variant="default"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
  });
});
