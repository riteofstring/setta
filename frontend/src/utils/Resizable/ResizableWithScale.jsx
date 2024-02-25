import { Resizable } from "re-resizable";
import React from "react";
import { useSetScaleOnResizeStart } from "./useSetScaleOnResizeStart";

export const ResizableWithScale = React.forwardRef(
  ({ children, onResizeStart, as, ...props }, ref) => {
    const { scale, onResizeStart: onResizeStart_ } = useSetScaleOnResizeStart();

    function localOnResizeStart(props) {
      onResizeStart && onResizeStart(props);
      onResizeStart_(props);
    }

    return (
      <Resizable
        {...props}
        scale={scale}
        as={as}
        onResizeStart={localOnResizeStart}
        ref={ref}
      >
        {children}
      </Resizable>
    );
  },
);
