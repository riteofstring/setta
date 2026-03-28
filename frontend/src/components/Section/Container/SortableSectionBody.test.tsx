import { getDndSectionId } from "forks/dnd-kit/dndState";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SortableSectionBody } from "./SortableSectionBody";

vi.mock("forks/dnd-kit/DummySection", () => ({
  TempDNDSection: () => <div data-testid="mock-temp-dnd-section" />,
}));

vi.mock("./SectionContainerNestedSections", () => ({
  renderSectionContainerNestedSections: ({
    layoutVariant,
    isJoinedCodeTerminalGroup,
  }: {
    layoutVariant: "default" | "tight";
    isJoinedCodeTerminalGroup: boolean;
  }) => (
    <div
      data-testid="mock-section-container-nested-sections"
      data-layout-variant={layoutVariant}
      data-is-joined-code-terminal-group={
        isJoinedCodeTerminalGroup ? "true" : "false"
      }
    />
  ),
}));

vi.mock("./SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
    dragListeners,
    renderNestedSections,
  }: {
    sectionId: string;
    dragListeners?: Record<string, unknown>;
    renderNestedSections: (props: {
      sectionId: string;
      isGroup: boolean;
      layoutVariant: "default" | "tight";
      isJoinedCodeTerminalGroup: boolean;
    }) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container"
      data-section-id={sectionId}
      data-has-drag-listeners={dragListeners ? "true" : "false"}
    >
      {renderNestedSections({
        sectionId,
        isGroup: false,
        layoutVariant: "tight",
        isJoinedCodeTerminalGroup: false,
      })}
    </div>
  ),
}));

describe("SortableSectionBody", () => {
  it("renders the temp placeholder for temp sections while their transform is applied", () => {
    const markup = renderToStaticMarkup(
      <SortableSectionBody
        sectionId={getDndSectionId("section-1")}
        applyTransform={true}
        listeners={{}}
      />,
    );

    expect(markup).toContain('data-testid="mock-temp-dnd-section"');
    expect(markup).not.toContain('data-testid="mock-section-container"');
  });

  it("renders nothing for temp sections once the initial transform is removed", () => {
    const markup = renderToStaticMarkup(
      <SortableSectionBody
        sectionId={getDndSectionId("section-1")}
        applyTransform={false}
        listeners={{}}
      />,
    );

    expect(markup).toBe("");
  });

  it("delegates regular sections into the SectionContainer boundary", () => {
    const markup = renderToStaticMarkup(
      <SortableSectionBody
        sectionId="section-1"
        applyTransform={false}
        listeners={{ onPointerDown: "listener" }}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-has-drag-listeners="true"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
  });
});
