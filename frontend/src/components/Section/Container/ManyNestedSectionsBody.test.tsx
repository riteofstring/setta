import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ManyNestedSectionsBody } from "./ManyNestedSectionsBody";

vi.mock("./SortableSectionContainer", () => ({
  SortableSectionContainer: ({
    sectionId,
    className,
  }: {
    sectionId: string;
    className?: string;
  }) => (
    <div
      data-testid="mock-sortable-section"
      data-section-id={sectionId}
      data-class-name={className ?? ""}
    />
  ),
}));

describe("ManyNestedSectionsBody", () => {
  it("renders tight nested sections through the sortable boundary with full-width children", () => {
    const markup = renderToStaticMarkup(
      <ManyNestedSectionsBody
        childIds={["child-a", "child-b"]}
        sectionId="parent"
        isGroup={false}
        isHorizontalOrientation={false}
        listRootViewMode={null}
        layoutVariant="tight"
      />,
    );

    expect(markup).toContain('class="flex w-full flex-col"');
    expect(markup).toContain('data-section-id="child-a"');
    expect(markup).toContain('data-section-id="child-b"');
    expect(markup).toContain('data-class-name="w-full"');
  });

  it("renders the kanban nested layout without the navigation rail", () => {
    const markup = renderToStaticMarkup(
      <ManyNestedSectionsBody
        childIds={["child-a"]}
        sectionId="parent"
        isGroup={false}
        isHorizontalOrientation={true}
        listRootViewMode="kanban"
        layoutVariant="default"
      />,
    );

    expect(markup).toContain(
      'class="mt-2 flex flex-row items-start gap-3 overflow-x-auto pb-2 pr-2"',
    );
    expect(markup).toContain(
      'data-class-name="w-full min-w-[18rem] max-w-[24rem]"',
    );
    expect(markup).not.toContain("hover:cursor-pointer");
  });

  it("renders the default nested layout with the navigation rail for non-group stacks", () => {
    const markup = renderToStaticMarkup(
      <ManyNestedSectionsBody
        childIds={["child-a"]}
        sectionId="parent"
        isGroup={false}
        isHorizontalOrientation={false}
        listRootViewMode={null}
        layoutVariant="default"
      />,
    );

    expect(markup).toContain('class="flex items-stretch"');
    expect(markup).toContain("hover:cursor-pointer");
    expect(markup).toContain('data-section-id="child-a"');
  });
});
