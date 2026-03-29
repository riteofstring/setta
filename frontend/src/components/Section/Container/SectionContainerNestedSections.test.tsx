import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

vi.mock("./ManyNestedSections", () => ({
  MaybeManyNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant,
    renderNestedSections,
  }: {
    sectionId: string;
    isGroup: boolean;
    layoutVariant?: "default" | "tight";
    renderNestedSections: ManyNestedSectionsRenderer;
  }) => (
    <div
      data-testid="mock-maybe-many-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-layout-variant={layoutVariant ?? "default"}
    >
      {renderNestedSections({
        childIds: ["child-a", "child-b"],
        childClassName: "from-section-container",
      })}
    </div>
  ),
}));

vi.mock("./SortableSectionContainer", () => ({
  SortableSectionContainer: ({
    sectionId,
    className,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    className?: string;
    SectionBoundary: (
      props: SortableSectionBodySectionBoundaryProps,
    ) => ReactNode;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-sortable-section"
      data-section-id={sectionId}
      data-class-name={className ?? ""}
      data-has-section-boundary={String(Boolean(SectionBoundary))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    >
      <SectionBoundary
        sectionId={sectionId}
        dragListeners={{ onPointerDown: "listener" }}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />
    </div>
  ),
}));

function MockSectionBoundary({
  sectionId,
}: SortableSectionBodySectionBoundaryProps) {
  return (
    <div
      data-testid="mock-sortable-section-section"
      data-section-id={sectionId}
    />
  );
}

function renderNestedSections({
  sectionId,
  layoutVariant,
  isJoinedCodeTerminalGroup,
}: SectionContainerNestedSectionsProps) {
  return (
    <div
      data-testid="mock-render-nested-sections"
      data-section-id={sectionId}
      data-layout-variant={layoutVariant}
      data-is-joined-code-terminal-group={
        isJoinedCodeTerminalGroup ? "true" : "false"
      }
    />
  );
}

function renderCoreBody({
  sectionId,
  sectionTypeName,
  bgColor,
}: SectionContainerCoreBodyProps) {
  return (
    <div
      data-testid="mock-render-core-body"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-bg-color={bgColor}
    />
  );
}

describe("SectionContainerNestedSections", () => {
  it("owns the lifted sortable section boundary while routing nested children through sortable section containers", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSections
        sectionId="section-1"
        SectionBoundary={MockSectionBoundary}
        isGroup={false}
        layoutVariant="default"
        isJoinedCodeTerminalGroup={false}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-testid="mock-maybe-many-nested-sections"');
    expect(markup).toContain('data-layout-variant="default"');
    expect(markup).toContain('data-testid="mock-sortable-section"');
    expect(markup).toContain('data-section-id="child-a"');
    expect(markup).toContain('data-section-id="child-b"');
    expect(markup).toContain('data-class-name="from-section-container"');
    expect(markup).toContain('data-has-section-boundary="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(markup).toContain('data-testid="mock-sortable-section-section"');
  });

  it("keeps the joined code-terminal wrapper while routing the same lifted sortable section boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSections
        sectionId="section-2"
        SectionBoundary={MockSectionBoundary}
        isGroup={true}
        layoutVariant="tight"
        isJoinedCodeTerminalGroup={true}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('class="-mt-px"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-testid="mock-sortable-section"');
    expect(markup).toContain('data-class-name="from-section-container"');
  });
});
