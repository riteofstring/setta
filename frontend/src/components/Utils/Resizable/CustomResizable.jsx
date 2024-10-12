import { useDndMode } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { setSectionResizeEvent } from "state/actions/sections/sectionInfos";
import { setSelfParentSiblingChildrenWidths } from "state/actions/sections/sectionSizes";
import { useSectionInfos } from "state/definitions";
import {
  useMaxSectionWidth,
  useMinSectionWidth,
  useSectionMinMaxDims,
  useSizeMode,
} from "state/hooks/sectionSizes";
import { ResizableWithScale } from "./ResizableWithScale";
import { getChangedSize, SIZE_MODE } from "./utils";

export function CustomResizable({ sectionId, children, inputClasses, as }) {
  const { minHeight, maxHeight } = useSectionMinMaxDims(sectionId);
  const minWidth = useMinSectionWidth(sectionId);
  const maxWidth = useMaxSectionWidth(sectionId);
  return (
    <CustomResizableCore
      sectionId={sectionId}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      inputClasses={inputClasses}
      as={as}
    >
      {children}
    </CustomResizableCore>
  );
}

function CustomResizableCore({
  sectionId,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  inputClasses = "",
  children,
  as,
}) {
  const { isSorting, isMovingFree } = useDndMode();
  const sizeMode = useSizeMode(sectionId);
  const size = useSectionInfos((x) => x.x[sectionId].size);
  const { aspectRatio, aspectRatioExtraHeight, aspectRatioExtraWidth } =
    useAspectRatio(sectionId);

  function onResizeStart() {
    setSectionResizeEvent({ sectionId, resizeEvent: "start" });
  }

  function onResizeStop(...props) {
    const changedSize = getChangedSize({
      props,
      minWidth,
      minHeight: "auto",
      sizeMode,
    });
    console.log("changedSize", changedSize);
    setSelfParentSiblingChildrenWidths({ sectionId, changedSize });
    setSectionResizeEvent({ sectionId, resizeEvent: "end" });
  }

  console.log("sizeMode", sizeMode);
  console.log("size", size);

  const heightResizable = sizeMode.height !== SIZE_MODE.auto_only;
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;

  const enable =
    isSorting || isMovingFree
      ? false
      : {
          top: false,
          left: false,
          bottom: heightResizable,
          right: widthResizable,
          topRight: false,
          bottomRight: heightResizable && widthResizable,
          topLeft: false,
          bottomLeft: false,
        };

  return (
    <ResizableWithScale
      id={`${sectionId}-CustomResizable`} // IMPORTANT, used as parent for codemirror autocomplete
      as={as}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
      lockAspectRatio={aspectRatio}
      lockAspectRatioExtraHeight={aspectRatioExtraHeight}
      lockAspectRatioExtraWidth={aspectRatioExtraWidth}
      handleWrapperClass="absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20"
      enable={enable}
      className={inputClasses}
      handleStyles={{ right: { right: "-8px" }, bottom: { bottom: "-8px" } }}
      // handleComponent={{ bottomRight: <ResizeIcon /> }}
    >
      {children}
    </ResizableWithScale>
  );
}

function useAspectRatio(sectionId) {
  return useSectionInfos((x) => {
    const s = x.x[sectionId];
    if (s.isMinimized) {
      return {
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
      };
    }
    return {
      aspectRatio: s.aspectRatio ?? false,
      aspectRatioExtraHeight: s.aspectRatioExtraHeight ?? 0,
      aspectRatioExtraWidth: s.aspectRatioExtraWidth ?? 0,
    };
  }, _.isEqual);
}
