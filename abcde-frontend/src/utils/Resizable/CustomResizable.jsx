import { OUTPUT } from "abcde-utils/src/constants";
import {
  useMaxSectionWidth,
  useMinSectionHeight,
  useMinSectionWidth,
} from "hooks/useSectionSizeBounds";
import { useGetSectionType } from "hooks/useSectionType";
import { useIsTwitter } from "hooks/useSocialUtils";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { ResizableWithScale } from "./ResizableWithScale";
import { ResizeIcon } from "./ResizeIcon";

export function CustomResizable({ sectionId, setLocalWidth, children }) {
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
  children,
}) {
  const autoAllowed = useAutoAllowed(sectionId);
  const savedSize = useSectionInfos((x) => x.x[sectionId].size);

  function onResizeStop(...props) {
    const { width, height } = getNewSize({
      props,
      minWidth,
      setLocalWidth,
      autoAllowed,
    });
    setSelfParentSiblingChildrenWidths({ sectionId, size: { width, height } });
  }

  function onResize(e, direction, ref) {
    if (ref.style.width !== "auto") {
      setLocalWidth(parseCurrPx(ref.style.width));
    }
  }

  const size = getSize({ savedSize, autoAllowed });

  return (
    <ResizableWithScale
      size={size}
      minHeight={minHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResize={onResize}
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
      handleComponent={{ bottomRight: <ResizeIcon /> }}
    >
      {children}
    </ResizableWithScale>
  );
}

function getSize({ savedSize, autoAllowed }) {
  return {
    width: maybeAuto(savedSize.width, autoAllowed.width),
    height: maybeAuto(savedSize.height, autoAllowed.height),
  };
}

function maybeAuto(x, autoAllowed) {
  return x === 0 && autoAllowed ? "auto" : x;
}

function parseCurrPx(x) {
  return x === "auto" ? 0 : parseInt(x);
}

function maybeAutoPx(minDim, pxDim, autoAllowed) {
  return autoAllowed ? minDim : pxDim;
}

function getDoubleClickSize({ direction, ref, minWidth, autoAllowed }) {
  // 0 means "auto"
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing

  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);

  if (direction === "bottomRight") {
    return [
      maybeAutoPx(minWidth, pxWidth, autoAllowed.width),
      maybeAutoPx(0, pxHeight, autoAllowed.height),
    ];
  }
  if (direction === "right" && autoAllowed.width) {
    return [maybeAutoPx(minWidth, pxWidth, autoAllowed.width), pxHeight];
  }
  if (direction === "bottom" && autoAllowed.height) {
    return [pxWidth, maybeAutoPx(0, pxHeight, autoAllowed.height)];
  }
  return [pxWidth, pxHeight];
}

function getNewSize({ props, minWidth, setLocalWidth, autoAllowed }) {
  const [e, direction, ref, d] = props;
  let width;
  let height;
  // detect double click (but only for non-output sections)
  if (d.width === 0 && d.height === 0 && e.detail === 2) {
    [width, height] = getDoubleClickSize({
      direction,
      ref,
      minWidth,
      autoAllowed,
    });
    setLocalWidth(width);
  } else {
    width = parseCurrPx(ref.style.width);
    height = parseCurrPx(ref.style.height);
  }
  return { width, height };
}

function useAutoAllowed(sectionId) {
  const sectionType = useGetSectionType(sectionId, "type");
  const isTwitter = useIsTwitter(sectionId);
  const height = sectionType !== OUTPUT;
  const width = sectionType !== OUTPUT && !isTwitter;
  return { height, width };
}
