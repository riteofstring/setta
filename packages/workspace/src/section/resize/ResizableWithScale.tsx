import { Resizable } from "re-resizable";
import type { ComponentProps, MouseEventHandler } from "react";
import { useState } from "react";
import { getReactFlowStore } from "../../canvas/store";
import { useWorkspaceHost } from "../../workspaceHostContext";

type ResizableWithScaleProps = ComponentProps<typeof Resizable> & {
  id?: string;
  onMouseDownCapture?: MouseEventHandler<HTMLDivElement>;
};

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
