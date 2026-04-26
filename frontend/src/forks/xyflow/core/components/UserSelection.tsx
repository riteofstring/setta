import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import type { GpuFlowViewportStore } from "gpuFlow/viewportStore";
import { shallow } from "zustand/shallow";

const selector = (s: GpuFlowViewportStore) => ({
  userSelectionActive: s.userSelectionActive,
  userSelectionRect: s.userSelectionRect,
});

function UserSelection() {
  const { userSelectionActive, userSelectionRect } = useGpuFlowViewportStore(
    selector,
    shallow,
  );
  const isActive = userSelectionActive && userSelectionRect;

  if (!isActive) {
    return null;
  }

  return (
    <div
      className="react-flow__selection react-flow__container"
      style={{
        width: userSelectionRect.width,
        height: userSelectionRect.height,
        transform: `translate(${userSelectionRect.x}px, ${userSelectionRect.y}px)`,
      }}
    />
  );
}

export default UserSelection;
