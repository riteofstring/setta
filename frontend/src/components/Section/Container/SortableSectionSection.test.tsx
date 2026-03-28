import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import { SortableSectionSection } from "./SortableSectionSection";

vi.mock("./SectionContainer", () => ({
  SectionContainer: ({
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
      data-testid="mock-section-container"
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

describe("SortableSectionSection", () => {
  it("delegates the lifted sortable section props into the generic section container", () => {
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
    }: SectionContainerNestedSectionsProps) => (
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
      <SortableSectionSection
        sectionId="section-1"
        dragListeners={{ onPointerDown: "listener" }}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
  });
});
