import { Resizable } from "re-resizable";
import { useSetScaleOnResizeStart } from "./useSetScaleOnResizeStart";

export function ResizableWithScale({ children, onResizeStart, as, ...props }) {
  const { scale, onResizeStart: onResizeStart_ } = useSetScaleOnResizeStart();

  function localOnResizeStart(...props) {
    onResizeStart && onResizeStart(...props);
    onResizeStart_(...props);
  }

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
