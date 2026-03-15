import type { Enable, HandleClassName, HandleStyles } from "re-resizable";
import type { ResizeHandleDirection } from "state/actions/sections/sectionSizeGeometry";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

type ResizableEnableState = false | Enable;

type CustomResizableChromeConfig = {
  enable: ResizableEnableState;
  handleStyles: HandleStyles;
  handleClasses: HandleClassName;
  handleWrapperClassName: string;
};

export function getResizeHandleDirectionFromTarget(
  target: EventTarget | null,
): ResizeHandleDirection | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const handleElement = target.closest(".section-resize-handle");
  if (!(handleElement instanceof HTMLElement)) {
    return null;
  }
  if (handleElement.classList.contains("section-resize-handle-bottom-right")) {
    return "bottomRight";
  }
  if (handleElement.classList.contains("section-resize-handle-bottom")) {
    return "bottom";
  }
  if (handleElement.classList.contains("section-resize-handle-right")) {
    return "right";
  }
  return null;
}

export function getCustomResizableChromeConfig({
  disablePointerEvents,
  allowPointerEvents,
  positionAndSizeLocked,
  heightResizable,
  widthResizable,
  isMetaControl,
  isAttachedTerminalChild,
  activeResizeHandle,
}: {
  disablePointerEvents: boolean;
  allowPointerEvents: boolean;
  positionAndSizeLocked: boolean;
  heightResizable: boolean;
  widthResizable: boolean;
  isMetaControl: boolean;
  isAttachedTerminalChild: boolean;
  activeResizeHandle: ResizeHandleDirection | null;
}): CustomResizableChromeConfig {
  const enable =
    disablePointerEvents || positionAndSizeLocked
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

  const handleBaseClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME}`;
  const handleBaseClasses: HandleClassName = {
    right: `${handleBaseClassName} section-resize-handle section-resize-handle-right`,
    bottom: `${handleBaseClassName} section-resize-handle section-resize-handle-bottom`,
    bottomRight: `${handleBaseClassName} section-resize-handle section-resize-handle-bottom-right`,
  };
  const metaControlHandleBaseClassName =
    "relative flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 after:absolute after:rounded after:bg-transparent hover:after:bg-blue-500/80 dark:hover:after:bg-blue-400/80";
  const handleWrapperClassName = isAttachedTerminalChild
    ? "absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-30"
    : "absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20";

  let handleStyles: HandleStyles = {
    right: { right: "-8px" },
    bottom: { bottom: "-8px" },
  };
  let handleClasses = handleBaseClasses;

  if (isAttachedTerminalChild) {
    handleStyles = {
      right: { right: "-4px", width: 16, top: 0, bottom: 0, height: "100%" },
      bottom: {
        bottom: "-4px",
        height: 16,
        left: 0,
        right: 0,
        width: "100%",
      },
      bottomRight: { right: "-4px", bottom: "-4px", width: 24, height: 24 },
    };
  }

  if (isMetaControl) {
    handleStyles = {
      right: { right: "-8px", width: 16, top: 0, bottom: 0, height: "100%" },
      bottom: {
        bottom: "-8px",
        height: 16,
        left: 0,
        right: 0,
        width: "100%",
      },
      bottomRight: { right: "-8px", bottom: "-8px", width: 16, height: 16 },
    };
    handleClasses = {
      right: `${handleBaseClassName} ${getMetaControlHandleClassName({
        activeResizeHandle,
        direction: "right",
        directionClassName:
          "cursor-col-resize after:inset-y-1 after:left-1/2 after:w-[3px] after:-translate-x-1/2",
        metaControlHandleBaseClassName,
      })}`,
      bottom: `${handleBaseClassName} ${getMetaControlHandleClassName({
        activeResizeHandle,
        direction: "bottom",
        directionClassName:
          "cursor-row-resize after:inset-x-1 after:top-1/2 after:h-[3px] after:-translate-y-1/2",
        metaControlHandleBaseClassName,
      })}`,
      bottomRight: `${handleBaseClassName} ${getMetaControlHandleClassName({
        activeResizeHandle,
        direction: "bottomRight",
        directionClassName: "cursor-nwse-resize after:inset-1",
        metaControlHandleBaseClassName,
      })}`,
    };
  }

  if (!allowPointerEvents && disablePointerEvents) {
    return {
      enable: false,
      handleStyles,
      handleClasses,
      handleWrapperClassName,
    };
  }

  return {
    enable,
    handleStyles,
    handleClasses,
    handleWrapperClassName,
  };
}

function getMetaControlHandleClassName({
  activeResizeHandle,
  direction,
  directionClassName,
  metaControlHandleBaseClassName,
}: {
  activeResizeHandle: ResizeHandleDirection | null;
  direction: "right" | "bottom" | "bottomRight";
  directionClassName: string;
  metaControlHandleBaseClassName: string;
}): string {
  const activeClassName =
    activeResizeHandle === direction
      ? "opacity-100 after:bg-blue-500/80 dark:after:bg-blue-400/80"
      : "";
  return `${metaControlHandleBaseClassName} ${activeClassName} ${directionClassName}`;
}
