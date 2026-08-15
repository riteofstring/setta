import { useEffect, type RefObject } from "react";

const WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE = "data-workspace-keyboard-focus";

export function useWorkspaceFocusVisibility(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error("Workspace focus visibility root did not mount.");
    }

    let keyboardFocusPending = false;

    const hideContainerFocus = (): void => {
      keyboardFocusPending = false;
      root.removeAttribute(WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE);
    };
    const handleFocusIn = (event: FocusEvent): void => {
      if (event.target instanceof Node && keyboardFocusPending && root.contains(event.target)) {
        root.setAttribute(WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE, "true");
      } else {
        root.removeAttribute(WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE);
      }
    };
    const handleKeyDown = (): void => {
      keyboardFocusPending = true;
    };
    const handleKeyUp = (): void => {
      keyboardFocusPending = false;
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("pointerdown", hideContainerFocus, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("pointerdown", hideContainerFocus, true);
    };
  }, [rootRef]);
}
