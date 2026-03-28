import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";

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

const renderNestedSections = vi.fn(
  ({ childIds, childClassName }: { childIds: string[]; childClassName: string }) => (
    <div
      data-testid="mock-render-nested-sections"
      data-child-ids={childIds.join(",")}
      data-child-class-name={childClassName}
    />
  ),
);

describe("SectionContainerNestedSections", () => {
  it("routes the caller-owned nested-section renderer into MaybeManyNestedSections", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSections
        sectionId="section-1"
        isGroup={false}
        layoutVariant="default"
        isJoinedCodeTerminalGroup={false}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-testid="mock-maybe-many-nested-sections"');
    expect(markup).toContain('data-layout-variant="default"');
    expect(markup).toContain('data-testid="mock-render-nested-sections"');
    expect(markup).toContain('data-child-ids="child-a,child-b"');
    expect(markup).toContain('data-child-class-name="from-section-container"');
  });

  it("keeps the joined code-terminal wrapper while routing the same caller-owned renderer", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSections
        sectionId="section-2"
        isGroup={true}
        layoutVariant="tight"
        isJoinedCodeTerminalGroup={true}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('class="-mt-px"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-testid="mock-render-nested-sections"');
    expect(markup).toContain('data-child-class-name="from-section-container"');
  });
});
