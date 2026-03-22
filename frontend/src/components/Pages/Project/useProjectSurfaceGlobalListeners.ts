import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { useMisc } from "state/definitions";

export function useProjectSurfaceGlobalListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      useMisc.setState({
        lastMouseDownLocation: { x: event.clientX, y: event.clientY },
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      useMisc.setState({
        lastMouseUpLocation: { x: event.clientX, y: event.clientY },
      });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);
}
