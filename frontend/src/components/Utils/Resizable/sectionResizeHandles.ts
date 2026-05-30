import type { CSSProperties } from "react";
import type { ResizeHandleDirection } from "state/actions/sections/sectionSizes";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

export const HANDLE_BASE_CLASS_NAME = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;

const DEFAULT_HANDLE_CLASSES = {
  right: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-right`,
  bottom: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-bottom`,
  bottomRight: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-bottom-right`,
};

const DEFAULT_HANDLE_STYLES = {
  right: { right: "-8px" },
  bottom: { bottom: "-8px" },
};

const ATTACHED_TERMINAL_HANDLE_STYLES = {
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

const META_CONTROL_HANDLE_STYLES = {
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

const DEFAULT_HANDLE_WRAPPER_CLASS_NAME = `absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} [&>div]:z-20`;
const ATTACHED_TERMINAL_HANDLE_WRAPPER_CLASS_NAME = `absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} [&>div]:z-30`;
const META_CONTROL_HANDLE_BASE_CLASS_NAME =
  "relative flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 after:absolute after:rounded after:bg-transparent hover:after:bg-blue-500/80 dark:hover:after:bg-blue-400/80";
const ACTIVE_META_CONTROL_HANDLE_CLASS_NAME =
  "opacity-100 after:bg-blue-500/80 dark:after:bg-blue-400/80";
const META_CONTROL_HANDLE_CURSOR_CLASSES = {
  right:
    "cursor-col-resize after:inset-y-1 after:left-1/2 after:w-[3px] after:-translate-x-1/2",
  bottom:
    "cursor-row-resize after:inset-x-1 after:top-1/2 after:h-[3px] after:-translate-y-1/2",
  bottomRight: "cursor-nwse-resize after:inset-1",
};

export const RESIZE_HANDLE_CLASS_NAMES = [
  ["section-resize-handle-bottom-right", "bottomRight"],
  ["section-resize-handle-bottom", "bottom"],
  ["section-resize-handle-right", "right"],
] as const satisfies ReadonlyArray<readonly [string, ResizeHandleDirection]>;

export type SectionResizeHandleDirection = Extract<
  ResizeHandleDirection,
  "right" | "bottom" | "bottomRight"
>;

export type SectionResizeHandleConfig = {
  handleClasses: Record<SectionResizeHandleDirection, string>;
  handleStyles: Partial<Record<SectionResizeHandleDirection, CSSProperties>>;
  handleWrapperClassName: string;
};

function getMetaControlHandleClass(
  direction: keyof typeof META_CONTROL_HANDLE_CURSOR_CLASSES,
  activeResizeHandle: string | null,
) {
  const isActive = activeResizeHandle === direction;
  return [
    HANDLE_BASE_CLASS_NAME,
    META_CONTROL_HANDLE_BASE_CLASS_NAME,
    isActive ? ACTIVE_META_CONTROL_HANDLE_CLASS_NAME : "",
    META_CONTROL_HANDLE_CURSOR_CLASSES[direction],
  ]
    .filter(Boolean)
    .join(" ");
}

export function getResizableHandleConfig({
  isMetaControl,
  isAttachedTerminalChild,
  activeResizeHandle,
}: {
  isMetaControl: boolean;
  isAttachedTerminalChild: boolean;
  activeResizeHandle: string | null;
}): SectionResizeHandleConfig {
  const handleWrapperClassName = isAttachedTerminalChild
    ? ATTACHED_TERMINAL_HANDLE_WRAPPER_CLASS_NAME
    : DEFAULT_HANDLE_WRAPPER_CLASS_NAME;
  if (isMetaControl) {
    return {
      handleStyles: META_CONTROL_HANDLE_STYLES,
      handleClasses: {
        right: getMetaControlHandleClass("right", activeResizeHandle),
        bottom: getMetaControlHandleClass("bottom", activeResizeHandle),
        bottomRight: getMetaControlHandleClass(
          "bottomRight",
          activeResizeHandle,
        ),
      },
      handleWrapperClassName,
    };
  }
  return {
    handleStyles: isAttachedTerminalChild
      ? ATTACHED_TERMINAL_HANDLE_STYLES
      : DEFAULT_HANDLE_STYLES,
    handleClasses: DEFAULT_HANDLE_CLASSES,
    handleWrapperClassName,
  };
}
