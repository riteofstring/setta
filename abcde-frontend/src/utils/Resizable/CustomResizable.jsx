import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { useStoreApi } from "react-flow-renderer";
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

function setSelfParentSiblingChildrenWidths({
  sectionId,
  d,
  minHeight,
  minWidth,
}) {
  // set own width
  useSectionInfos.getState().setSectionInfoAttr({
    sectionId,
    attr: "size",
    newValueFn: getNewSizeFn({
      d,
      minHeight,
      minWidth,
      updateHeight: true,
      updateWidth: true,
    }),
  });

  setAllOtherWidths({ sectionId, d, minHeight, minWidth });
}

function setAllOtherWidths({ sectionId, d, minHeight, minWidth }) {
  const highestAncestor = getHighestAncestor(sectionId);
  const sectionIds = [highestAncestor];
  const s = useSectionInfos.getState();
  let idx = 0;
  while (idx < sectionIds.length) {
    const currId = sectionIds[idx];
    sectionIds.push(...s.currChildren[currId]);
    idx += 1;
  }
  useSectionInfos.getState().setSectionInfoAttr({
    sectionIds: sectionIds.filter((x) => x !== sectionId),
    attr: "size",
    newValueFn: getNewSizeFn({
      d,
      minHeight,
      minWidth,
      updateHeight: false,
      updateWidth: true,
    }),
  });
}

function getHighestAncestor(sectionId) {
  const s = useSectionInfos.getState();
  let parentId = s.x[sectionId].parentId;
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = s.x[parentId].parentId;
  }

  return highestAncestor;
}

function getNewSizeFn({ d, minHeight, minWidth, updateHeight, updateWidth }) {
  return (size) => {
    const newHeight = updateHeight
      ? Math.max(size.height + d.height, minHeight)
      : size.height;
    const newWidth = updateWidth
      ? Math.max(size.width + d.width, minWidth)
      : size.width;
    return { height: newHeight, width: newWidth };
  };
}
