import { Resizable } from "re-resizable";

export function ResizableDescription({ children }) {
  const minHeight = 150;
  return (
    <Resizable
      // size={size}
      minHeight={minHeight}
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
      className="flex flex-1 "
    >
      {children}
    </Resizable>
  );
}
