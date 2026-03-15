import { useShareCapabilities } from "state/hooks/share";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

export function ResizeHandle({ showResizeHandle, onMouseDown }) {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout || !showResizeHandle) {
    return null;
  }
  return (
    <div
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-center nopan nodrag group/resize relative mx-auto h-[90%] w-4 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-ml-px after:w-0.5 after:rounded-sm after:bg-transparent group-hover/arg-group:after:bg-setta-500/15 before:absolute before:top-0.5 before:bottom-0.5 before:left-1/2 before:-ml-[3px] before:w-1.5 before:rounded before:bg-transparent hover:before:!bg-blue-500 group-hover/resize:before:bg-setta-200 group-hover/resize:dark:before:bg-setta-500`}
      data-param-resize-handle="true"
      onMouseDown={onMouseDown}
    />
  );
}
