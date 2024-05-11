import { goToSection } from "thunks/goToSection";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export function ManyNestedSections({ sectionId, isDeck }) {
  const tempChildIds = useDndChildren((x) => x.x[sectionId]);

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

  const direction = true;
  return (
    <div className="flex items-stretch">
      {!isDeck && (
        <div
          className={`mr-2 mt-2 min-h-full w-2 rounded-full bg-white opacity-[.16] transition-all duration-75 hover:cursor-pointer hover:opacity-[.36] dark:bg-runcoder-700`}
          onClick={onClick}
        />
      )}
      <div
        className={`flex ${direction ? "mt-2 flex-col" : " flex-row"} items-start gap-2`}
      >
        {childIds.map((e) => (
          <SortableSectionContainer
            sectionId={e}
            key={`Nested-Sec-${e}`}
            direction={direction}
          />
        ))}
      </div>
    </div>
  );
}
