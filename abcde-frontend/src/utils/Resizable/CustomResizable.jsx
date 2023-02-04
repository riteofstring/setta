import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { useStoreApi } from "react-flow-renderer";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { SECTIONWIDTH } from "utils/constants";

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
  const rfStore = useStoreApi();
  const savedSize = useSectionInfos((x) => x.x[sectionId].size);
  const [size, setSize] = useState(savedSize);
  const [scale, setScale] = useState(1);

  function onResizeStop(e, direction, ref, d) {
    setSelfParentSiblingChildrenWidths({ sectionId, d, minHeight, minWidth });
  }

  function onResizeStart() {
    setScale(rfStore.getState().transform[2]);
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
