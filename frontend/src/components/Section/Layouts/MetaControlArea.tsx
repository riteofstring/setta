import React from "react";
import { MetaControlContent } from "components/MetaControls/MetaControlNode";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

function _MetaControlArea({ sectionId }: { sectionId: string }) {
  const metaControlType = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.MetaControl,
    );
    return impl.metaControlType;
  });

  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      <MetaControlContent metaControlType={metaControlType} />
    </div>
  );
}

export const MetaControlArea = React.memo(_MetaControlArea);
