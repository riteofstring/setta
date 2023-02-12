import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect, useState } from "react";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { SECTIONWIDTH } from "utils/constants";
import { ResizableWithScale } from "./ResizableWithScale";

export function CustomResizable({ sectionId, handleComponent, children }) {
  const minHeight = useMinSectionHeight(sectionId);
  const minWidth = SECTIONWIDTH;
  return (
    <CustomResizableCore
      sectionId={sectionId}
      minHeight={minHeight}
      minWidth={minWidth}
      handleComponent={handleComponent}
    >
      {children}
    </CustomResizableCore>
  );
}

function CustomResizableCore({
  sectionId,
  minHeight,
  minWidth,
  children,
  handleComponent,
}) {
  const savedSize = useSectionInfos((x) => x.x[sectionId].size);
  const [size, setSize] = useState(savedSize);

  function onResizeStop(e, direction, ref, d) {
    setSelfParentSiblingChildrenWidths({ sectionId, d, minHeight, minWidth });
  }

  useEffect(() => {
    if (!_.isEqual(size, savedSize)) {
      setSize(savedSize);
    }
  }, [savedSize.width, savedSize.height]);

  return (
    <ResizableWithScale
      size={size}
      minHeight={minHeight}
      minWidth={minWidth}
      onResizeStop={onResizeStop}
      handleWrapperClass="nodrag [&>div]:z-20"
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: true,
        bottomRight: true,
      }}
      className="flex flex-col items-stretch"
      handleComponent={handleComponent}
    >
      {children}
    </ResizableWithScale>
  );
}
