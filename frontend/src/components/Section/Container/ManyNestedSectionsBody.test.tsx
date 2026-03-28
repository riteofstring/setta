import type { ManyNestedSectionsRendererProps } from "./manyNestedSectionsView";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManyNestedSectionsBody } from "./ManyNestedSectionsBody";

const renderNestedSections = vi.fn(
  ({ childIds, childClassName }: ManyNestedSectionsRendererProps) => (
    <div
      data-testid="mock-nested-sections"
      data-child-ids={childIds.join("|")}
      data-child-class-name={childClassName ?? ""}
    />
  ),
);

describe("ManyNestedSectionsBody", () => {
  beforeEach(() => {
    renderNestedSections.mockClear();
  });

  it("renders tight nested sections through the sortable boundary with full-width children", () => {
    const markup = renderToStaticMarkup(
      <ManyNestedSectionsBody
        childIds={["child-a", "child-b"]}
        sectionId="parent"
        isGroup={false}
        isHorizontalOrientation={false}
        listRootViewMode={null}
        layoutVariant="tight"
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('class="flex w-full flex-col"');
    expect(markup).toContain('data-testid="mock-nested-sections"');
    expect(markup).toContain('data-child-ids="child-a|child-b"');
    expect(markup).toContain('data-child-class-name="w-full"');
    expect(renderNestedSections).toHaveBeenCalledWith({
      childIds: ["child-a", "child-b"],
      childClassName: "w-full",
    });
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
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain(
      'class="mt-2 flex flex-row items-start gap-3 overflow-x-auto pb-2 pr-2"',
    );
    expect(markup).toContain(
      'data-child-class-name="w-full min-w-[18rem] max-w-[24rem]"',
    );
    expect(markup).not.toContain("hover:cursor-pointer");
    expect(renderNestedSections).toHaveBeenCalledWith({
      childIds: ["child-a"],
      childClassName: "w-full min-w-[18rem] max-w-[24rem]",
    });
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
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('class="flex items-stretch"');
    expect(markup).toContain("hover:cursor-pointer");
    expect(markup).toContain('data-child-ids="child-a"');
    expect(renderNestedSections).toHaveBeenCalledWith({
      childIds: ["child-a"],
      childClassName: undefined,
    });
  });
});
