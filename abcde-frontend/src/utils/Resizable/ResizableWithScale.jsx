import { Resizable } from "re-resizable";
import { useSetScaleOnResizeStart } from "./useSetScaleOnResizeStart";

export function ResizableWithScale({ children, onResizeStart, ...props }) {
  const { scale, onResizeStart: onResizeStart_ } = useSetScaleOnResizeStart();

  function localOnResizeStart(props) {
    onResizeStart && onResizeStart(props);
    onResizeStart_(props);
  }

  return (
    <Resizable {...props} scale={scale} onResizeStart={localOnResizeStart}>
      {children}
    </Resizable>
  );
}
