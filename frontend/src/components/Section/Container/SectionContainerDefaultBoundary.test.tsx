import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerBoundaryProps } from "./SectionContainerBoundary";
import { SectionContainerDefaultBoundary } from "./SectionContainerDefaultBoundary";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";

const mockSectionContainerBoundary = vi.fn(
  ({
    sectionId,
    dragListeners,
    renderCoreBody,
    renderNestedSections,
  }: SectionContainerBoundaryProps) => (
    <div
      data-testid="mock-section-container-boundary"
      data-section-id={sectionId}
      data-has-drag-listeners={String(Boolean(dragListeners))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
);

vi.mock("./SectionContainerBoundary", () => ({
  SectionContainerBoundary: (props: SectionContainerBoundaryProps) =>
    mockSectionContainerBoundary(props),
}));

vi.mock("./sectionContainerDefaultRenderers", () => ({
  renderDefaultSectionContainerCoreBody: () => null,
  renderDefaultSectionContainerNestedSections: () => null,
}));

describe("SectionContainerDefaultBoundary", () => {
  it("owns the default recursive renderers above the injected top-level SectionBoundary handoff", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerDefaultBoundary sectionId="section-1" />,
    );
    const forwardedProps = mockSectionContainerBoundary.mock.calls[0]?.[0];

    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-has-drag-listeners="false"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(forwardedProps?.renderCoreBody).toBe(
      renderDefaultSectionContainerCoreBody,
    );
    expect(forwardedProps?.renderNestedSections).toBe(
      renderDefaultSectionContainerNestedSections,
    );
  });

  it("still forwards drag listeners through the injected top-level SectionBoundary handoff", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerDefaultBoundary
        sectionId="section-2"
        dragListeners={{ onPointerDown: "listener" }}
      />,
    );
    const forwardedProps = mockSectionContainerBoundary.mock.calls[1]?.[0];

    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(forwardedProps?.dragListeners).toEqual({
      onPointerDown: "listener",
    });
  });
});
