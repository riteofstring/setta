import { useShareCapabilities } from "state/hooks/share";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

export function ResizeHandle({ showResizeHandle, onMouseDown }) {
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
      className={`section-center ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nopan nodrag relative mx-auto h-[90%] w-4 cursor-col-resize rounded-sm before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:rounded-sm after:pointer-events-none after:absolute after:inset-y-[2px] after:left-1/2 after:w-1.5 after:-translate-x-1/2 after:rounded after:bg-transparent hover:after:!bg-blue-500 group-hover/arg-group:before:bg-setta-500/15 group-hover/arg-group:after:bg-setta-200 group-hover/arg-group:dark:after:bg-setta-500`}
      onMouseDown={onMouseDown}
    />
  );
}
