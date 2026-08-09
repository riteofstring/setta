import { useEffect } from "react";
import { useReactFlow } from "./store";
import { isMacOs } from "./utils";

// The reference binds these through its app shortcut engine with the shipped defaults:
// selectionKeyCode = Shift, multiSelectionKeyCode = Mod, zoomActivationKeyCode = Mod,
// panActivationKeyCode = Space (ignored while typing in editable targets). The package owns the
// same activation-key state directly on the canvas store.
function getIsEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useCanvasKeyActivations() {
  useEffect(() => {
    const macOS = isMacOs();
    const modKey = macOS ? "Meta" : "Control";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        useReactFlow.setState({ selectionKeyPressed: true });
      }
      if (event.key === modKey) {
        useReactFlow.setState({
          multiSelectionActive: true,
          zoomActivationKeyPressed: true,
        });
      }
      if (event.key === " " && !getIsEditableTarget(event)) {
        useReactFlow.setState({ panActivationKeyPressed: true });
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        useReactFlow.setState({ selectionKeyPressed: false });
      }
      if (event.key === modKey) {
        useReactFlow.setState({ multiSelectionActive: false, zoomActivationKeyPressed: false });
        // On macOS, keyup events for held non-modifier keys are swallowed while Meta is down,
        // so releasing Meta also releases the pan activation (the reference clears its
        // pressed-key set the same way).
        if (macOS) {
          useReactFlow.setState({ panActivationKeyPressed: false });
        }
      }
      if (event.key === " ") {
        useReactFlow.setState({ panActivationKeyPressed: false });
      }
    };

    const onWindowBlur = () => {
      useReactFlow.setState({
        selectionKeyPressed: false,
        multiSelectionActive: false,
        zoomActivationKeyPressed: false,
        panActivationKeyPressed: false,
      });
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);
}
