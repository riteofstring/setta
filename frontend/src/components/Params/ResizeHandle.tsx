import { useShareCapabilities } from "state/hooks/share";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

export function ResizeHandle({ showResizeHandle, onMouseDown }) {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout) {
    return null;
  }
  return (
    <div className="section-center relative mx-auto h-[90%] w-0.5 rounded-sm group-hover/arg-group:bg-setta-500/15">
      {showResizeHandle && (
        <div
          className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} nopan nodrag group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 cursor-col-resize items-center justify-center before:block before:h-[calc(100%-4px)] before:w-1.5 before:rounded before:bg-transparent before:content-[''] hover:before:!bg-blue-500 group-hover/resize:before:bg-setta-200 group-hover/resize:dark:before:bg-setta-500`}
          onMouseDown={onMouseDown}
        />
      )}
    </div>
  );
}
