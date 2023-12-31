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
import { useEffect } from "react";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { OUTPUT } from "z_utils/constants";
import { ResizableWithScale } from "./ResizableWithScale";
import { ResizeIcon } from "./ResizeIcon";

const SIZE_MODE = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
};

export function CustomResizable({
  sectionId,
  setLocalWidth,
  children,
  inputClasses,
  as,
}) {
  const minHeight = useMinSectionHeight(sectionId);
  const minWidth = useMinSectionWidth(sectionId);
  const maxWidth = useMaxSectionWidth(sectionId);
  return (
    <CustomResizableCore
      sectionId={sectionId}
      minHeight={minHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      setLocalWidth={setLocalWidth}
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
  setLocalWidth,
  inputClasses = "",
  children,
  as,
}) {
  const sizeMode = useSizeMode(sectionId);
  const size = useSectionInfos((x) => x.x[sectionId].size);
  const aspectRatio = useAspectRatio(sectionId);

  function onResizeStop(...props) {
    const { width, height } = getNewSize({
      props,
      minWidth,
      setLocalWidth,
      sizeMode,
    });
    setSelfParentSiblingChildrenWidths({ sectionId, size: { width, height } });
  }

  function onResize(e, direction, ref) {
    setLocalWidth(parseCurrPx(ref.style.width));
  }

  useEffect(() => {
    setLocalWidth(size.width);
  }, [size.width]);

  const heightResizable = sizeMode.height !== SIZE_MODE.auto_only;
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;

  return (
    <ResizableWithScale
      as={as}
      size={size}
      minHeight={minHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResize={onResize}
      onResizeStop={onResizeStop}
      lockAspectRatio={aspectRatio}
      handleWrapperClass="absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20"
      enable={{
        top: false,
        left: false,
        bottom: heightResizable,
        right: widthResizable,
        bottomRight: heightResizable && widthResizable,
      }}
      className={`flex flex-col items-stretch ${inputClasses}`}
      handleComponent={{ bottomRight: <ResizeIcon /> }}
    >
      {children}
    </ResizableWithScale>
  );
}

function parseCurrPx(x) {
  return x === "auto" ? x : parseInt(x);
}

function maybeAutoPx(autoDim, pxDim, sizeMode) {
  return sizeMode !== SIZE_MODE.manual_only ? autoDim : pxDim;
}

function getDoubleClickSize({ direction, ref, minWidth, sizeMode }) {
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing

  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);

  if (direction === "bottomRight") {
    return [
      maybeAutoPx(minWidth, pxWidth, sizeMode.width),
      maybeAutoPx("auto", pxHeight, sizeMode.height),
    ];
  }
  if (direction === "right" && sizeMode.width) {
    return [maybeAutoPx(minWidth, pxWidth, sizeMode.width), pxHeight];
  }
  if (direction === "bottom" && sizeMode.height) {
    return [pxWidth, maybeAutoPx("auto", pxHeight, sizeMode.height)];
  }
  return [pxWidth, pxHeight];
}

function getNewSize({ props, minWidth, setLocalWidth, sizeMode }) {
  const [e, direction, ref, d] = props;
  let width;
  let height;
  // detect double click (but only for non-output sections)
  if (d.width === 0 && d.height === 0 && e.detail === 2) {
    [width, height] = getDoubleClickSize({
      direction,
      ref,
      minWidth,
      sizeMode,
    });
    setLocalWidth(width);
  } else {
    width = parseCurrPx(ref.style.width);
    height = parseCurrPx(ref.style.height);
  }
  return { width, height };
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
