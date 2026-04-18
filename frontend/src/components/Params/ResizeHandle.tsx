import type { MouseEventHandler } from "react";
import { useShareCapabilities } from "state/hooks/share";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

export function ResizeHandle({
  showResizeHandle,
  onMouseDown,
  lightweight = false,
}: {
  showResizeHandle: boolean;
  onMouseDown: MouseEventHandler;
  lightweight?: boolean;
}) {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout) {
    return null;
  }
  if (showResizeHandle && lightweight) {
    return (
      <div
        className={`section-center ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nopan nodrag relative mx-auto h-[90%] w-4 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:rounded-sm before:bg-transparent before:content-[''] group-hover/arg-group:before:bg-setta-500/15 after:absolute after:inset-y-[2px] after:left-1/2 after:w-1.5 after:-translate-x-1/2 after:rounded after:bg-transparent after:content-[''] group-hover/arg-group:after:bg-setta-200 group-hover/arg-group:dark:after:bg-setta-500 hover:after:!bg-blue-500`}
        data-param-resize-handle="true"
        data-param-resize-handle-lightweight="true"
        onMouseDown={onMouseDown}
      />
    );
  }
  return (
    <div className="section-center relative mx-auto h-[90%] w-0.5 rounded-sm group-hover/arg-group:bg-setta-500/15">
      {showResizeHandle && (
        <div
          className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} nopan nodrag group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 cursor-col-resize items-center justify-center`}
          data-param-resize-handle="true"
          onMouseDown={onMouseDown}
        >
          <div className="h-[calc(100%-4px)] w-1.5 rounded bg-transparent hover:!bg-blue-500 group-hover/resize:bg-setta-200 group-hover/resize:dark:bg-setta-500" />
        </div>
      )}
    </div>
  );
}
