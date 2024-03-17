import {
  useMaxSectionWidth,
  useMinSectionHeight,
  useMinSectionWidth,
} from "hooks/useSectionSizeBounds";
import { useGetSectionType } from "hooks/useSectionType";
import {
  useIsTwitter,
  useIsYouTube,
  youtubeSectionAspectRatio,
} from "hooks/useSocialUtils";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { useDndMode } from "utils/DNDSortable/dndState";
import { OUTPUT } from "z_utils/constants";
import { ResizableWithScale } from "./ResizableWithScale";
import { getNewSize, SIZE_MODE } from "./utils";

export function CustomResizable({ sectionId, children, inputClasses, as }) {
  const minHeight = useMinSectionHeight(sectionId);
  const minWidth = useMinSectionWidth(sectionId);
  const maxWidth = useMaxSectionWidth(sectionId);
  return (
    <CustomResizableCore
      sectionId={sectionId}
      minHeight={minHeight}
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
  minWidth,
  maxWidth,
  inputClasses = "",
  children,
  as,
}) {
  const { isSorting, isMovingFree } = useDndMode();
  const sizeMode = useSizeMode(sectionId);
  const size = useSectionInfos((x) => x.x[sectionId].size);
  const aspectRatio = useAspectRatio(sectionId);

  function onResizeStart() {
    useSectionInfos
      .getState()
      .setResizeEvent({ sectionId, resizeEvent: "start" });
  }

  function onResizeStop(...props) {
    const { width, height } = getNewSize({
      props,
      minWidth,
      minHeight: "auto",
      sizeMode,
    });
    setSelfParentSiblingChildrenWidths({ sectionId, size: { width, height } });
    useSectionInfos
      .getState()
      .setResizeEvent({ sectionId, resizeEvent: "end" });
  }

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
          bottomRight: heightResizable && widthResizable,
        };

  return (
    <ResizableWithScale
      id={sectionId}
      as={as}
      size={size}
      minHeight={minHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
      lockAspectRatio={aspectRatio}
      handleWrapperClass="absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20"
      enable={enable}
      className={inputClasses}
      // handleComponent={{ bottomRight: <ResizeIcon /> }}
    >
      {children}
    </ResizableWithScale>
  );
}

function useSizeMode(sectionId) {
  const sectionType = useGetSectionType(sectionId, "type");
  const isTwitter = useIsTwitter(sectionId);
  if (sectionType === OUTPUT) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  } else if (isTwitter) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  } else {
    return { height: SIZE_MODE.any, width: SIZE_MODE.any };
  }
}

function useAspectRatio(sectionId) {
  const isYouTube = useIsYouTube(sectionId);
  return isYouTube ? youtubeSectionAspectRatio : false;
}
