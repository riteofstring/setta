import { useReactFlow } from "forks/xyflow/core/store";
import { Resizable } from "re-resizable";
import React, { useState } from "react";

function _ResizableWithScale({ children, onResizeStart, as, ...props }) {
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

export const ResizableWithScale = React.memo(_ResizableWithScale, () => true);

function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(useReactFlow.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
