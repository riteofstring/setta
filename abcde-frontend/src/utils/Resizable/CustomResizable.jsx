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

  function onResizeStop(e, direction, ref) {
    const width = parseCurrPx(ref.style.width);
    const height = parseCurrPx(ref.style.height);
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
