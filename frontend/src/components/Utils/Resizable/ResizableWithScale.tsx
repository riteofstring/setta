import { useReactFlow } from "forks/xyflow/core/store";
import { Resizable } from "re-resizable";
import { isValidElement, type ReactNode, useState } from "react";

class WrapperlessHandleResizable extends Resizable {
  renderResizer() {
    const resizers = super.renderResizer();
    if (
      isValidElement<{ children?: ReactNode }>(resizers) &&
      resizers.type === "div"
    ) {
      return <>{resizers.props.children}</>;
    }
    return resizers;
  }
}

export function ResizableWithScale({ children, onResizeStart, as, ...props }) {
  const { scale, onResizeStart: onResizeStart_ } = useSetScaleOnResizeStart();

  function localOnResizeStart(...props) {
    onResizeStart && onResizeStart(...props);
    onResizeStart_(...props);
  }

  return (
    <WrapperlessHandleResizable
      {...props}
      scale={scale}
      as={as}
      onResizeStart={localOnResizeStart}
    >
      {children}
    </WrapperlessHandleResizable>
  );
}

function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(useReactFlow.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
