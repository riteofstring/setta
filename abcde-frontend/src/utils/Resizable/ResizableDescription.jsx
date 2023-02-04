import { Resizable } from "re-resizable";
import { useSetScaleOnResizeStart } from "./useSetScaleOnResizeStart";

export function ResizableDescription({ children }) {
  const minHeight = 150;
  const { scale, onResizeStart } = useSetScaleOnResizeStart();

  return (
    <Resizable
      minHeight={minHeight}
      onResizeStart={onResizeStart}
      handleWrapperClass="nodrag"
      scale={scale}
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: false,
        bottomRight: false,
      }}
      className="z-[500] flex flex-1"
    >
      {children}
    </Resizable>
  );
}
