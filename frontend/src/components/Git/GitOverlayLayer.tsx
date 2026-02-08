import { GitDiffOverlay } from "components/Git/GitDiffOverlay";
import { GitGraphOverlay } from "components/Git/GitGraphOverlay";
import { useEffect } from "react";
import { closeGitOverlay } from "state/actions/git";
import { useLocalStorage } from "state/definitions";
import { useGitStore } from "state/git";

export function GitOverlayLayer() {
  const overlayKind = useGitStore((x) => x.overlay.kind);
  const { overviewWidth, uiEditorWidth } = useLocalStorage((x) => ({
    overviewWidth: x.overviewTrueWidth,
    uiEditorWidth: x.uiEditorTrueWidth,
  }));

  useEffect(() => {
    if (overlayKind === "none") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeGitOverlay();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [overlayKind]);

  if (overlayKind === "none") {
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
        {overlayKind === "diff" ? <GitDiffOverlay /> : <GitGraphOverlay />}
      </div>
    </div>
  );
}
