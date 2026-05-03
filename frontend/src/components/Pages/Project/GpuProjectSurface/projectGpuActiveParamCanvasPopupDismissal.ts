import { useEffect, type RefObject } from "react";

import type { ProjectGpuActiveParamCanvasPopup } from "./projectGpuLayoutAdapter";

export function useProjectGpuActiveParamCanvasPopupDismissal<
  RootElement extends HTMLElement,
>({
  activeParamCanvasPopup,
  onDismiss,
  rootRef,
}: {
  readonly activeParamCanvasPopup: ProjectGpuActiveParamCanvasPopup | null;
  readonly onDismiss: () => void;
  readonly rootRef: RefObject<RootElement | null>;
}) {
  useEffect(() => {
    if (!activeParamCanvasPopup) {
      return;
    }
    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldDismissProjectGpuActiveParamCanvasPopupOnKeyDown(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !shouldDismissProjectGpuActiveParamCanvasPopupOnPointerDown(
          event,
          rootRef.current,
        )
      ) {
        return;
      }
      onDismiss();
    };
    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [activeParamCanvasPopup, onDismiss, rootRef]);
}

export function shouldDismissProjectGpuActiveParamCanvasPopupOnKeyDown(
  event: Pick<KeyboardEvent, "defaultPrevented" | "key">,
): boolean {
  return !event.defaultPrevented && event.key === "Escape";
}

export function shouldDismissProjectGpuActiveParamCanvasPopupOnPointerDown(
  event: Pick<PointerEvent, "defaultPrevented" | "target">,
  root: HTMLElement | null,
): boolean {
  return (
    !event.defaultPrevented &&
    !(root && event.target instanceof Node && root.contains(event.target))
  );
}
