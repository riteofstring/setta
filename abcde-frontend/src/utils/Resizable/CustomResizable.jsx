import { Resizable } from "re-resizable";
import { SECTIONWIDTH } from "utils/constants";

export function CustomResizable({ children }) {
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
    >
      <div style={{ backgroundColor: "hsla(50, 100%, 50%, 1)" }}>
        {children}
      </div>
    </Resizable>
  );
}
