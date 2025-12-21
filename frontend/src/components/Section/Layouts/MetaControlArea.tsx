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
    <div className="section-row-main section-w-full flex items-start px-3 py-2">
      <MetaControlContent metaControlType={metaControlType} />
    </div>
  );
}

export const MetaControlArea = React.memo(_MetaControlArea);
