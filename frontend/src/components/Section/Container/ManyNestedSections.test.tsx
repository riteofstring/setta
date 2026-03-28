import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";

let mockDndChildrenMap: Record<string, string[]> = {
  "section-1": ["child-a", "child-b"],
};
let mockImpl = {
  type: SectionTypeEnum.Group,
  isHorizontalOrientation: false,
  viewMode: null,
};
let mockEmbeddedTerminal:
  | {
      isTerminalMinimized: boolean;
      attachedTerminalId: string;
    }
  | null = null;
let mockHasTempNested = true;

vi.mock("forks/dnd-kit/dndChildren", () => ({
  useDndChildren: (
    selector: (state: { x: Record<string, string[]> }) => unknown,
  ) => selector({ x: mockDndChildrenMap }),
}));

vi.mock("forks/dnd-kit/DNDSortable", () => ({
  DNDSortable: ({
    children,
    items,
    sectionId,
  }: {
    children: ReactNode;
    items: string[];
    sectionId: string;
  }) => (
    <div
      data-testid="mock-dnd-sortable"
      data-section-id={sectionId}
      data-items={items.join("|")}
    >
      {children}
    </div>
  ),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => mockImpl,
  getEmbeddedAttachedTerminalForCodeSection: () => mockEmbeddedTerminal,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: object) => unknown) => selector({}),
}));

vi.mock("./utils", () => ({
  useHasTempNested: () => mockHasTempNested,
}));

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

vi.mock("./ManyNestedSectionsBody", () => ({
  ManyNestedSectionsBody: ({
    childIds,
    sectionId,
    renderNestedSections,
  }: {
    childIds: string[];
    sectionId: string;
    renderNestedSections: ManyNestedSectionsRenderer;
  }) => (
    <div
      data-testid="mock-many-nested-sections-body"
      data-section-id={sectionId}
      data-child-ids={childIds.join("|")}
    >
      {
        // The caller owns the default renderer handoff; invoke it here to pin that seam.
        renderNestedSections({
          childIds,
          childClassName: "from-body",
        })
      }
    </div>
  ),
}));

describe("MaybeManyNestedSections", () => {
  beforeEach(() => {
    mockDndChildrenMap = {
      "section-1": ["child-a", "child-b"],
    };
    mockImpl = {
      type: SectionTypeEnum.Group,
      isHorizontalOrientation: false,
      viewMode: null,
    };
    mockEmbeddedTerminal = null;
    mockHasTempNested = true;
  });

  it("injects the sortable nested-section renderer into the lifted body boundary", () => {
    const markup = renderToStaticMarkup(
      <MaybeManyNestedSections sectionId="section-1" isGroup={false} />,
    );

    expect(markup).toContain('data-testid="mock-dnd-sortable"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-items="child-a|child-b"');
    expect(markup).toContain('data-testid="mock-many-nested-sections-body"');
    expect(markup).toContain('data-child-ids="child-a|child-b"');
    expect(markup).toContain('data-testid="mock-sortable-section"');
    expect(markup).toContain('data-class-name="from-body"');
  });
});
