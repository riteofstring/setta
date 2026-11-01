import _ from "lodash";
import { applyActiveSectionChange } from "../../canvas/activeSectionController.js";
import { focusWorkspaceSection } from "../../canvas/viewportHelpers.js";
import { useDndChildren } from "../../dnd/dndChildren.js";
import { DNDSortable } from "../../dnd/DNDSortable.js";
import { useHasTempNested } from "../../dnd/useDndUtils.js";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors.js";
import { useWorkspaceDocument } from "../../document/stores.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import {
  SortableSectionContainer,
  type SortableSectionRenderer,
} from "./SortableSectionContainer.js";

export function MaybeManyNestedSections({
  isGroup,
  renderSection,
  sectionId,
}: {
  isGroup: boolean;
  renderSection: SortableSectionRenderer;
  sectionId: string;
}) {
  const hasNested = useHasTempNested(sectionId);
  return (
    hasNested && (
      <div className="flex flex-col">
        <ManyNestedSections
          isGroup={isGroup}
          renderSection={renderSection}
          sectionId={sectionId}
        />
      </div>
    )
  );
}

function ManyNestedSections({
  isGroup,
  renderSection,
  sectionId,
}: {
  isGroup: boolean;
  renderSection: SortableSectionRenderer;
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
        renderSection={renderSection}
        sectionId={sectionId}
      />
    </DNDSortable>
  );
}

function NestedSectionsWithMargin({
  childIds,
  isGroup,
  isHorizontalOrientation,
  renderSection,
  sectionId,
}: {
  childIds: Array<string>;
  isGroup: boolean;
  isHorizontalOrientation: boolean;
  renderSection: SortableSectionRenderer;
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
            key={`Nested-Sec-${childId}`}
            renderSection={renderSection}
            sectionId={childId}
          />
        ))}
      </div>
    </div>
  );
}
