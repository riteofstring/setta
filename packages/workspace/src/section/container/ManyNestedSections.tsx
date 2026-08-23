import _ from "lodash";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { focusWorkspaceSection } from "../../canvas/viewportHelpers";
import { useDndChildren } from "../../dnd/dndChildren";
import { DNDSortable } from "../../dnd/DNDSortable";
import { useHasTempNested } from "../../dnd/useDndUtils";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors";
import { useWorkspaceDocument } from "../../document/stores";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { SortableSectionContainer } from "./SortableSectionContainer";

// The reference's `ManyNestedSections.tsx` at the supported default-view slice: child lists render
// from the live dnd projection (temp placeholder included), inside the sortable context. Ordinary
// nested-section owners retain main's focus rail and inset; groups do not render that rail.

export function MaybeManyNestedSections({
  isGroup,
  sectionId,
}: {
  isGroup: boolean;
  sectionId: string;
}) {
  const hasNested = useHasTempNested(sectionId);
  return (
    hasNested && (
      <div className="flex flex-col">
        <ManyNestedSections isGroup={isGroup} sectionId={sectionId} />
      </div>
    )
  );
}

function ManyNestedSections({
  isGroup,
  sectionId,
}: {
  isGroup: boolean;
  sectionId: string;
}) {
  const childIds = useDndChildren((x) => x.x[sectionId] ?? [], _.isEqual);
  const isHorizontalOrientation = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return isGroupSection(section) && section.isHorizontalOrientation;
  });

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      <NestedSectionsWithMargin
        childIds={childIds}
        isGroup={isGroup}
        isHorizontalOrientation={isHorizontalOrientation}
        sectionId={sectionId}
      />
    </DNDSortable>
  );
}

function NestedSectionsWithMargin({
  childIds,
  isGroup,
  isHorizontalOrientation,
  sectionId,
}: {
  childIds: Array<string>;
  isGroup: boolean;
  isHorizontalOrientation: boolean;
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const containerClassName = isHorizontalOrientation
    ? "mt-2 flex flex-row items-start gap-2"
    : "mt-2 flex flex-col items-start gap-2";

  function focusOwner() {
    focusWorkspaceSection(host, sectionId);
    applyActiveSectionChange(host, { interaction: "go-to", sectionId });
  }

  return (
    <div className="flex items-stretch">
      {!isGroup ? (
        <button
          aria-label="Focus parent section"
          className="mr-2 mt-2 min-h-full w-2 rounded-full bg-white/30 transition-all duration-75 hover:cursor-pointer hover:bg-white/50 dark:bg-setta-700 hover:dark:bg-setta-600"
          onClick={focusOwner}
          type="button"
        />
      ) : null}
      <div className={containerClassName}>
        {childIds.map((childId) => (
          <SortableSectionContainer
            sectionId={childId}
            key={`Nested-Sec-${childId}`}
          />
        ))}
      </div>
    </div>
  );
}
