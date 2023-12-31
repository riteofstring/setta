import { useIsDraggingFreely } from "hooks/useDndUtils";
import { useGoToSection } from "hooks/useGetSectionPosition";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export function ManyNestedSections({
  childIds,
  sectionId,
  ancestorSet,
  isDeck,
}) {
  const newAncestorSet = { ...ancestorSet, [sectionId]: true };

  return (
    <DNDSortable
      sectionId={sectionId}
      items={childIds}
      ancestorSet={newAncestorSet}
    >
      <NestedSectionsWithMargin
        childIds={childIds}
        sectionId={sectionId}
        ancestorSet={newAncestorSet}
        isDeck={isDeck}
      />
    </DNDSortable>
  );
}

// disabled is passed in by DNDSortable
function NestedSectionsWithMargin({
  childIds,
  sectionId,
  ancestorSet,
  isDeck,
  droppableDisabled,
}) {
  const goToSection = useGoToSection();

  const onClick = () => {
    goToSection(sectionId);
  };

  const rightMargin = useRightMargin(droppableDisabled);

  return (
    <div className="flex items-stretch">
      {!isDeck && (
        <div
          className={`mt-2 transition-all duration-75 ${rightMargin} min-h-full w-[12px] rounded-full bg-white opacity-[.16] hover:cursor-pointer hover:opacity-[.36] dark:bg-runcoder-700`}
          onClick={onClick}
        />
      )}
      <div className="flex flex-col items-start gap-2 ">
        {childIds.map((e, idx) => (
          <SortableSectionContainer
            parentId={sectionId}
            sectionId={e}
            nextId={childIds[idx + 1]}
            key={`Nested-Sec-${e}`}
            ancestorSet={ancestorSet}
          />
        ))}
      </div>
    </div>
  );
}

function useRightMargin(droppableDisabled) {
  const isDraggingFreely = useIsDraggingFreely();
  return isDraggingFreely && !droppableDisabled ? "mr-10" : "mr-2";
}
