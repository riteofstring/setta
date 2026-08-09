import _ from "lodash";
import { useDndChildren } from "../../dnd/dndChildren";
import { DNDSortable } from "../../dnd/DNDSortable";
import { useHasTempNested } from "../../dnd/useDndUtils";
import { getSectionOrThrow, isGroupSection } from "../../document/documentSelectors";
import { useWorkspaceDocument } from "../../document/stores";
import { SortableSectionContainer } from "./SortableSectionContainer";

// The reference's `ManyNestedSections.tsx` at the slice: the child lists render from the live
// dnd children projection (temp placeholder included), inside the group's sortable context. The
// reference's list-root view modes, attached-terminal hiding, and non-group side rail left with
// their app features.

export function MaybeManyNestedSections({ sectionId }: { sectionId: string }) {
  const hasNested = useHasTempNested(sectionId);
  return (
    hasNested && (
      <div className="flex flex-col">
        <ManyNestedSections sectionId={sectionId} />
      </div>
    )
  );
}

function ManyNestedSections({ sectionId }: { sectionId: string }) {
  const childIds = useDndChildren((x) => x.x[sectionId] ?? [], _.isEqual);
  const isHorizontalOrientation = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return isGroupSection(section) && section.isHorizontalOrientation;
  });

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      <NestedSectionsWithMargin
        childIds={childIds}
        isHorizontalOrientation={isHorizontalOrientation}
      />
    </DNDSortable>
  );
}

function NestedSectionsWithMargin({
  childIds,
  isHorizontalOrientation,
}: {
  childIds: Array<string>;
  isHorizontalOrientation: boolean;
}) {
  const containerClassName = isHorizontalOrientation
    ? "mt-2 flex flex-row items-start gap-2"
    : "mt-2 flex flex-col items-start gap-2";

  return (
    <div className="flex items-stretch">
      <div className={containerClassName}>
        {childIds.map((childId) => (
          <SortableSectionContainer sectionId={childId} key={`Nested-Sec-${childId}`} />
        ))}
      </div>
    </div>
  );
}
