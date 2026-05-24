import { WorkspaceCanvas } from "components/WorkspaceCanvas/WorkspaceCanvas";
import { useEffect } from "react";
import { useMisc } from "state/definitions";

export function UIPage() {
  useLastMouseDownMouseUpLocation();
  return <WorkspaceCanvas />;
}

function useLastMouseDownMouseUpLocation() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      setLastPointerLocation("lastMouseDownLocation", event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      setLastPointerLocation("lastMouseUpLocation", event);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);
}

function setLastPointerLocation(
  key: "lastMouseDownLocation" | "lastMouseUpLocation",
  event: PointerEvent,
) {
  useMisc.setState({
    [key]: { x: event.clientX, y: event.clientY },
  } as unknown as Parameters<typeof useMisc.setState>[0]);
}
