import { getZoom } from "gpuFlow/viewportActions";
import { Resizable } from "re-resizable";
import { useState } from "react";

export function ResizableWithScale({ children, onResizeStart, as, ...props }) {
  const { scale, onResizeStart: onResizeStart_ } = useSetScaleOnResizeStart();

  function localOnResizeStart(...props) {
    if (onResizeStart) {
      onResizeStart(...props);
    }
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

function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(getZoom());
  }
  return { scale, onResizeStart };
}
