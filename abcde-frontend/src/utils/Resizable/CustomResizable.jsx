import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { SECTIONWIDTH } from "utils/constants";
import { useSetScaleOnResizeStart } from "./useSetScaleOnResizeStart";

export function CustomResizable({ sectionId, children }) {
  const minHeight = useMinSectionHeight(sectionId);
  const minWidth = SECTIONWIDTH;
  return (
    <CustomResizableCore
      sectionId={sectionId}
      minHeight={minHeight}
      minWidth={minWidth}
    >
      {children}
    </CustomResizableCore>
  );
}

function CustomResizableCore({ sectionId, minHeight, minWidth, children }) {
  const savedSize = useSectionInfos((x) => x.x[sectionId].size);
  const [size, setSize] = useState(savedSize);
  const { scale, onResizeStart } = useSetScaleOnResizeStart();

  function onResizeStop(e, direction, ref, d) {
    setSelfParentSiblingChildrenWidths({ sectionId, d, minHeight, minWidth });
  }

  useEffect(() => {
    if (!_.isEqual(size, savedSize)) {
      setSize(savedSize);
    }
  }, [savedSize.width, savedSize.height]);

  return (
    <Resizable
      size={size}
      minHeight={minHeight}
      minWidth={minWidth}
      onResizeStop={onResizeStop}
      onResizeStart={onResizeStart}
      handleWrapperClass="nodrag"
      scale={scale}
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: true,
        bottomRight: true,
      }}
      className="flex flex-col items-stretch"
    >
      {children}
    </Resizable>
  );
}
