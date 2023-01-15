import { Resizable } from "re-resizable";
import { useStore } from "react-flow-renderer";
import { SECTIONWIDTH } from "utils/constants";

export function CustomResizable({ children }) {
  const zoom = useStore((x) => x.transform[2]);

  function onResizeStart() {
    // setIsResizing(true);
  }
  function onResizeStop() {
    // setIsResizing(false);
  }

  const className = "nodrag";

  return (
    <Resizable
      minWidth={SECTIONWIDTH}
      handleWrapperClass={className}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
      scale={zoom}
    >
      {children}
    </Resizable>
  );
}
