import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSelfParentSiblingChildrenWidths } from "thunks/sections/sectionSizes";
import { SECTIONWIDTH } from "utils/constants";
import { ResizableWithScale } from "./ResizableWithScale";
import { ResizeIcon } from "./ResizeIcon";

export function CustomResizable({ sectionId, setLocalWidth, children }) {
  const minHeight = useMinSectionHeight(sectionId);
  const minWidth = SECTIONWIDTH;
  return (
    <CustomResizableCore
      sectionId={sectionId}
      minHeight={minHeight}
      minWidth={minWidth}
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
  setLocalWidth,
  children,
}) {
  const savedSize = useSectionInfos((x) => x.x[sectionId].size);

  function onResizeStop(...props) {
    const { width, height } = getNewSize({ props, minWidth, setLocalWidth });
    setSelfParentSiblingChildrenWidths({ sectionId, size: { width, height } });
  }

  function onResize(e, direction, ref) {
    if (ref.style.width !== "auto") {
      setLocalWidth(parseCurrPx(ref.style.width));
    }
  }

  const size = {
    width: maybeAuto(savedSize.width),
    height: maybeAuto(savedSize.height),
  };

  return (
    <ResizableWithScale
      size={size}
      minHeight={minHeight}
      minWidth={minWidth}
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

function maybeAuto(x) {
  return x === 0 ? "auto" : x;
}

function parseCurrPx(x) {
  return x === "auto" ? 0 : parseInt(x);
}

function getDoubleClickWidth({ direction, ref, minWidth }) {
  // 0 means "auto"
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing
  if (direction === "bottomRight") {
    return [minWidth, 0];
  }
  if (direction === "right") {
    return [minWidth, parseCurrPx(ref.style.height)];
  }
  if (direction === "bottom") {
    return [parseCurrPx(ref.style.width), 0];
  }
}

function getNewSize({ props, minWidth, setLocalWidth }) {
  const [e, direction, ref, d] = props;
  let width;
  let height;
  // detect double click
  if (d.width === 0 && d.height === 0 && e.detail === 2) {
    [width, height] = getDoubleClickWidth({ direction, ref, minWidth });
    setLocalWidth(width);
  } else {
    width = parseCurrPx(ref.style.width);
    height = parseCurrPx(ref.style.height);
  }
  return { width, height };
}
