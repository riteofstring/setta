import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { GroupContainerShell } from "./groupContainerShell";

function _ParamGroupContainer({
  sectionId,
  bgColor,
  sectionTypeName,
}: {
  sectionId: string;
  bgColor: string;
  sectionTypeName: SectionTypeEnum;
}) {
  return (
    <ParamDndContext>
      <GroupContainerShell
        bgColor={bgColor}
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
      />
    </ParamDndContext>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
