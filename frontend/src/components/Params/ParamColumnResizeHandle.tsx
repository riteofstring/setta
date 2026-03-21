import { useShareCapabilities } from "state/hooks/share";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

type ParamColumnResizeHandleProps = {
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
};

export function ParamColumnResizeHandle({
  onMouseDown,
}: ParamColumnResizeHandleProps) {
  const { canEditLayout } = useShareCapabilities();
  if (!canEditLayout) {
    return null;
  }

  return (
    <div
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-center nopan nodrag absolute inset-y-0 z-[1] w-4 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-ml-px after:w-0.5 after:rounded-sm after:bg-transparent before:absolute before:top-0.5 before:bottom-0.5 before:left-1/2 before:-ml-[3px] before:w-1.5 before:rounded before:bg-transparent hover:before:!bg-blue-500 group-hover/param-rows:after:bg-setta-500/15 group-hover/param-rows:before:bg-setta-200 group-hover/param-rows:dark:before:bg-setta-500`}
      data-param-column-resize-overlay="true"
      onMouseDown={onMouseDown}
      style={{
        left: "calc(var(--param-column-width, 200px) + 0.72rem + 2px)",
      }}
    />
  );
}
