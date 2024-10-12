import C from "constants/constants.json";
import { useDndMode } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { setSectionResizeEvent } from "state/actions/sections/sectionInfos";
import { setSelfParentSiblingChildrenWidths } from "state/actions/sections/sectionSizes";
import { useSectionInfos } from "state/definitions";
import {
  useMaxSectionHeight,
  useMaxSectionWidth,
  useMinSectionHeight,
  useMinSectionWidth,
} from "state/hooks/sectionSizes";
import { useIsTwitter } from "state/hooks/social";
import { useGetSectionType } from "state/hooks/uiTypes";
import { ResizableWithScale } from "./ResizableWithScale";
import { getNewSize, SIZE_MODE } from "./utils";

export function CustomResizable({ sectionId, children, inputClasses, as }) {
  const minHeight = useMinSectionHeight(sectionId);
  const maxHeight = useMaxSectionHeight(sectionId);
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
  const isMinimized = useSectionInfos((x) => x.x[sectionId].isMinimized);
  const sizeMode = useSizeMode(sectionId);
  const size = useSectionInfos((x) => x.x[sectionId].size);
  const { aspectRatio, aspectRatioExtraHeight, aspectRatioExtraWidth } =
    useAspectRatio(sectionId);

  function onResizeStart() {
    setSectionResizeEvent({ sectionId, resizeEvent: "start" });
  }

  function onResizeStop(...props) {
    const { width, height } = getNewSize({
      props,
      minWidth,
      minHeight: "auto",
      sizeMode,
    });
    setSelfParentSiblingChildrenWidths({ sectionId, size: { width, height } });
    setSectionResizeEvent({ sectionId, resizeEvent: "end" });
  }

  const heightResizable =
    !isMinimized && sizeMode.height !== SIZE_MODE.auto_only;
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;

  console.log("size", size);

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

function useSizeMode(sectionId) {
  const sectionType = useGetSectionType(sectionId, "type");
  const isTwitter = useIsTwitter(sectionId);
  if (sectionType === C.ARTIFACT) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  } else if (isTwitter) {
    return { height: SIZE_MODE.any, width: SIZE_MODE.any };
  } else {
    return { height: SIZE_MODE.any, width: SIZE_MODE.any };
  }
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
