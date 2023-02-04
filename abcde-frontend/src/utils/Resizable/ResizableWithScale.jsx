import { Resizable } from "re-resizable";
import { useSetScaleOnResizeStart } from "./useSetScaleOnResizeStart";

export function ResizableWithScale({ children, ...props }) {
  const { scale, onResizeStart } = useSetScaleOnResizeStart();

  return (
    <Resizable {...props} scale={scale} onResizeStart={onResizeStart}>
      {children}
    </Resizable>
  );
}
