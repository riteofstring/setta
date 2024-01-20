import { useIsDraggingFreely } from "hooks/useDndUtils";
import { goToSection } from "thunks/goToSection";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export function ManyNestedSections({ childIds, sectionId, isDeck }) {
  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      <NestedSectionsWithMargin
        childIds={childIds}
        sectionId={sectionId}
        isDeck={isDeck}
      />
    </DNDSortable>
  );
}

// disabled is passed in by DNDSortable
function NestedSectionsWithMargin({
  childIds,
  sectionId,
  isDeck,
  droppableDisabled,
}) {
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
        {childIds.map((e) => (
          <SortableSectionContainer sectionId={e} key={`Nested-Sec-${e}`} />
        ))}
      </div>
    </div>
  );
}

function useRightMargin(droppableDisabled) {
  const isDraggingFreely = useIsDraggingFreely();
  return isDraggingFreely && !droppableDisabled ? "mr-10" : "mr-2";
}
