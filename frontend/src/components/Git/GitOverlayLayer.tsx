import { GitDiffOverlay } from "components/Git/GitDiffOverlay";
import { useEffect } from "react";
import { closeGitOverlay } from "state/actions/git";
import { useLocalStorage } from "state/definitions";
import { useGitStore } from "state/git";

function isEditableEscapeTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return (
    target.closest(
      "input, textarea, [contenteditable=''], [contenteditable='true']",
    ) !== null
  );
}

export function GitOverlayLayer() {
  const overlayKind = useGitStore((x) => x.overlay.kind);
  const { overviewWidth, uiEditorWidth } = useLocalStorage((x) => ({
    overviewWidth: x.overviewTrueWidth,
    uiEditorWidth: x.uiEditorTrueWidth,
  }));

  useEffect(() => {
    if (overlayKind !== "diff") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      if (isEditableEscapeTarget(event.target)) {
        return;
      }
      closeGitOverlay();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [overlayKind]);

  if (overlayKind !== "diff") {
    return null;
  }

  return (
    <div className="single-cell-container pointer-events-none relative z-[15] col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0">
      <div
        className="pointer-events-auto absolute inset-y-0 min-h-0 min-w-0"
        style={{
          left: overviewWidth,
          right: uiEditorWidth,
        }}
      >
        <GitDiffOverlay />
      </div>
    </div>
  );
}

export const gitOverlayLayerTestApi = {
  isEditableEscapeTarget,
};
