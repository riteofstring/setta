import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import type { SectionContainerSectionBoundaryProps } from "./SectionContainerSection";

const mockSectionContainerSection = vi.fn(
  ({
    sectionId,
    isTopLevel,
    dragListeners,
    renderCoreBody,
    renderNestedSections,
  }: SectionContainerSectionBoundaryProps) => (
    <div
      data-testid="mock-section-container-section"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-drag-listeners={String(Boolean(dragListeners))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
);

vi.mock("./SectionContainerSection", () => ({
  SectionContainerSection: (props: SectionContainerSectionBoundaryProps) =>
    mockSectionContainerSection(props),
}));

describe("SectionContainerBoundary", () => {
  it("forwards caller-owned recursive renderers through the lifted top-level section boundary", () => {
    const renderCoreBody = () => null;
    const renderNestedSections = () => null;
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary
        sectionId="section-1"
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );
    const forwardedProps = mockSectionContainerSection.mock.calls[0]?.[0];

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="false"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(forwardedProps?.renderCoreBody).toBe(renderCoreBody);
    expect(forwardedProps?.renderNestedSections).toBe(renderNestedSections);
  });

  it("still forwards drag listeners through the lifted top-level boundary", () => {
    const renderCoreBody = () => null;
    const renderNestedSections = () => null;
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary
        sectionId="section-2"
        dragListeners={{ onPointerDown: "listener" }}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );
    const forwardedProps = mockSectionContainerSection.mock.calls[1]?.[0];

    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(forwardedProps?.dragListeners).toEqual({
      onPointerDown: "listener",
    });
  });
});
