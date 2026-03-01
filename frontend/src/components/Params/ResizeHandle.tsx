import type { MouseEventHandler } from "react";
import { useShareCapabilities } from "state/hooks/share";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

type ResizeHandleProps = {
  showResizeHandle: boolean;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
};

export function ResizeHandle({ showResizeHandle, onMouseDown }: ResizeHandleProps) {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout) {
    return null;
  }

  if (!showResizeHandle) {
    return (
      <div className="section-center relative mx-auto h-[90%] w-0.5 rounded-sm group-hover/arg-group:bg-setta-500/15" />
    );
  }

  return (
    <div
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-center nopan nodrag relative mx-auto h-[90%] w-4 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-sm after:bg-transparent after:transition-colors before:absolute before:inset-y-[2px] before:left-1/2 before:w-1.5 before:-translate-x-1/2 before:rounded before:bg-transparent before:transition-colors group-hover/arg-group:after:bg-setta-500/15 group-hover/arg-group:before:bg-setta-200 group-hover/arg-group:dark:before:bg-setta-500 hover:before:!bg-blue-500`}
      onMouseDown={onMouseDown}
    />
  );
}
