import { Resizable } from "re-resizable";

export function ResizableDescription({ children }) {
  return (
    <Resizable
      // size={size}
      // minHeight={minHeight}
      // minWidth={minWidth}
      // onResizeStop={onResizeStop}
      // onResizeStart={onResizeStart}
      handleWrapperClass="nodrag"
      // scale={scale}
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: false,
        bottomRight: false,
      }}
      className="flex flex-1 overflow-hidden"
    >
      {children}
    </Resizable>
  );
}
