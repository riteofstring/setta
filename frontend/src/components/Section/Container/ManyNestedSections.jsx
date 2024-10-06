import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { DNDSortable } from "forks/dnd-kit/DNDSortable";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useSectionInfos } from "state/definitions";
import { SortableSectionContainer } from "./SortableSectionContainer";
import useDeepCompareEffect from "use-deep-compare-effect";

export function ManyNestedSections({ sectionId, isDeck }) {
  const tempChildIds = useDndChildren((x) => x.x[sectionId]);

  // useDeepCompareEffect(()=>{console.log("tempChildIds", tempChildIds)},[tempChildIds])

  return (
    <DNDSortable sectionId={sectionId} items={tempChildIds}>
      <NestedSectionsWithMargin
        childIds={tempChildIds}
        sectionId={sectionId}
        isDeck={isDeck}
      />
    </DNDSortable>
  );
}

// disabled is passed in by DNDSortable
function NestedSectionsWithMargin({ childIds, sectionId, isDeck }) {
  const onClick = () => {
    goToSection(sectionId);
  };

  const isHorizontalOrientation = useSectionInfos(
    (x) => x.x[sectionId].isHorizontalOrientation,
  );

  return (
    <div className="flex items-stretch">
      {!isDeck && (
        <div
          className={`mr-2 mt-2 min-h-full w-2 rounded-full bg-white opacity-[.16] transition-all duration-75 hover:cursor-pointer hover:opacity-[.36] dark:bg-setta-700`}
          onClick={onClick}
        />
      )}
      <div
        className={`mt-2 flex ${isHorizontalOrientation ? "flex-row" : "flex-col "} items-start gap-2`}
      >
        {childIds.map((e) => (
          <SortableSectionContainer
            sectionId={e}
            key={`Nested-Sec-${e}`}
            isHorizontalOrientation={isHorizontalOrientation}
          />
        ))}
      </div>
    </div>
  );
}
