import { paneResizePreviewForPointerMove, type PaneResizeSession } from "./pane-resize-session";

export interface PaneResizeStageOriginRef {
  current: { left: number; top: number } | null;
}

export function clearPaneResizePreview(
  preview: HTMLElement | null,
  stageOriginRef: PaneResizeStageOriginRef,
): void {
  if (!preview) {
    return;
  }
  preview.dataset.visible = "false";
  preview.dataset.axis = "";
  preview.style.transform = "";
  stageOriginRef.current = null;
}

export function syncPaneResizePreview({
  event,
  previewElement,
  session,
  stage,
  stageOriginRef,
}: {
  event: PointerEvent;
  previewElement: HTMLElement | null;
  session: PaneResizeSession;
  stage: HTMLElement;
  stageOriginRef: PaneResizeStageOriginRef;
}): void {
  if (!previewElement) {
    return;
  }
  const stageOrigin =
    stageOriginRef.current ??
    (() => {
      const rect = stage.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })();
  stageOriginRef.current = stageOrigin;
  const preview = paneResizePreviewForPointerMove(session, event);
  previewElement.dataset.axis = preview.axis;
  previewElement.dataset.visible = "true";
  if (session.axis === "horizontal" && preview.axis === "horizontal") {
    const x = session.startClientX + preview.width - session.startWidth - stageOrigin.left;
    previewElement.style.transform = `translate3d(${Math.round(x)}px, 0, 0)`;
    return;
  }
  if (session.axis === "height" && preview.axis === "height") {
    const y = session.startClientY + preview.height - session.startHeight - stageOrigin.top;
    previewElement.dataset.axis = "vertical";
    previewElement.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
    return;
  }
  if (session.axis !== "vertical" || preview.axis !== "vertical") {
    return;
  }
  const y = session.startClientY + preview.upperHeight - session.upperStartHeight - stageOrigin.top;
  previewElement.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
}
