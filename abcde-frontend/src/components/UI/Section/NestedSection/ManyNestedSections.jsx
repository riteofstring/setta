import { useGoToSection } from "hooks/useGetSectionPosition";
import { useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export function ManyNestedSections({
  childIds,
  sectionId,
  ancestorSet,
  isDeck,
}) {
  const goToSection = useGoToSection(sectionId);

  const onClick = () => {
    goToSection();
  };

  const newAncestorSet = { ...ancestorSet, [sectionId]: true };
  const { rightMargin, onTransitionEnd } = useMarginTransition();

  return (
    <DNDSortable
      sectionId={sectionId}
      items={childIds}
      ancestorSet={newAncestorSet}
    >
      <div className="flex items-stretch">
        {!isDeck && (
          <div
            className={`mt-2 transition-all duration-75 ${rightMargin} min-h-full w-[12px] rounded-full bg-white opacity-[.16] hover:cursor-pointer hover:opacity-[.36]`}
            onClick={onClick}
            onTransitionEnd={onTransitionEnd}
          />
        )}
        <div className="flex flex-col items-start gap-2 ">
          {childIds.map((e, idx) => (
            <SortableSectionContainer
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              ancestorSet={newAncestorSet}
            />
          ))}
        </div>
      </div>
    </DNDSortable>
  );
}

function useMarginTransition() {
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const activeIsTruthy = useDndState((x) => !!x.active);
  const setNestedTransitionComplete = useDndState(
    (x) => x.setNestedTransitionComplete
  );
  const rightMargin = isMovingFree && activeIsTruthy ? "mr-10" : "mr-2";

  function onTransitionEnd() {
    setNestedTransitionComplete(activeIsTruthy);
  }

  return { rightMargin, onTransitionEnd };
}
