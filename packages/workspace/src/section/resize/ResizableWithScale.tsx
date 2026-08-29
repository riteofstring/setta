import { Resizable } from "re-resizable";
import type { ComponentProps, MouseEventHandler } from "react";
import { useState } from "react";
import { getReactFlowStore } from "../../canvas/store";
import { useWorkspaceHost } from "../../workspaceHostContext";

// re-resizable spreads unknown props onto its wrapper element at runtime but does not declare
// them; the reference relies on that for the section-scoped `id` and the handle mouse-down
// capture.
type ResizableWithScaleProps = ComponentProps<typeof Resizable> & {
  id?: string;
  onMouseDownCapture?: MouseEventHandler<HTMLDivElement>;
};

// The reference feeds the canvas zoom into re-resizable at resize start so pointer deltas
// translate to canvas-space sizes at any zoom level.
export function ResizableWithScale({
  children,
  onResizeStart,
  as,
  ...props
}: ResizableWithScaleProps) {
  const { scale, onResizeStart: onResizeStart_ } = useSetScaleOnResizeStart();

  const localOnResizeStart: NonNullable<
    ResizableWithScaleProps["onResizeStart"]
  > = (...args) => {
    onResizeStart?.(...args);
    onResizeStart_();
  };

  return (
    <Resizable
      {...props}
      scale={scale}
      as={as}
      onResizeStart={localOnResizeStart}
    >
      {children}
    </Resizable>
  );
}

function useSetScaleOnResizeStart() {
  const host = useWorkspaceHost();
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(getReactFlowStore(host).getState().transform[2]);
  }
  return { scale, onResizeStart };
}
