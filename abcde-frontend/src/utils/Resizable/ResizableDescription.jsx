import { ResizableWithScale } from "./ResizableWithScale";

export function ResizableDescription({ children }) {
  const minHeight = 150;

  return (
    <ResizableWithScale
      minHeight={minHeight}
      handleWrapperClass="nodrag"
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
    </ResizableWithScale>
  );
}
