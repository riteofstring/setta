import { useEffect, type RefObject } from "react";

const WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE = "data-workspace-keyboard-focus";

const MODIFIER_ONLY_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useWorkspaceFocusVisibility(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error("Workspace focus visibility root did not mount.");
    }

    const hideContainerFocus = (): void => {
      root.removeAttribute(WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (MODIFIER_ONLY_KEYS.has(event.key)) {
        hideContainerFocus();
        return;
      }
      root.setAttribute(WORKSPACE_KEYBOARD_FOCUS_ATTRIBUTE, "true");
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", hideContainerFocus, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", hideContainerFocus, true);
    };
  }, [rootRef]);
}
