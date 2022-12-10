import { HStack } from "@chakra-ui/react";
import { useGoToSection } from "hooks/useGetSectionPosition";
import { INDICATOR_GOTO_PARENT } from "utils/constants";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";

import { NestedSection } from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  depth,
  isDeck,
}) {
  const goToSection = useGoToSection(sectionId, INDICATOR_GOTO_PARENT);

  const onClick = () => {
    goToSection();
  };

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      <HStack alignItems="stretch">
        {!isDeck && (
          <div
            className="w-[12px] bg-white opacity-[.16] rounded-full min-h-full hover:opacity-[.36] hover:cursor-pointer mb-1 z-[200]"
            onClick={onClick}
          />
        )}
        <div className="space-y-2 items-start">
          {childIds.map((e, idx) => (
            <NestedSection
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
            />
          ))}
        </div>
      </HStack>
    </DNDSortable>
  );
}
