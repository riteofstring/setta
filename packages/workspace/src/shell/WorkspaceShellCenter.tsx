import { WorkspaceCanvas } from "../canvas/WorkspaceCanvas.js";
import type { WorkspaceCanvasConfiguration } from "../canvas/configuration.js";
import { useWorkspaceDocument } from "../document/stores.js";
import { WORKSPACE_SAVED_VIEW_TABS_HEIGHT_PX } from "./WorkspaceSavedViewTabs.js";

export function useHasWorkspaceShellSavedViewTabs(
  includeSavedViewTabs: boolean,
): boolean {
  return useWorkspaceDocument((state) => {
    if (!includeSavedViewTabs || state.savedViews === null) {
      return false;
    }
    return Object.values(state.savedViews.views).some((view) => view.isTab);
  });
}

export function getWorkspaceShellSavedViewTabsHeight(
  hasSavedViewTabs: boolean,
): number {
  return hasSavedViewTabs ? WORKSPACE_SAVED_VIEW_TABS_HEIGHT_PX : 0;
}

export function WorkspaceShellCenter({
  canvas,
  hasSavedViewTabs,
  savedViewPanelId,
}: {
  canvas?: WorkspaceCanvasConfiguration;
  hasSavedViewTabs: boolean;
  savedViewPanelId: string;
}) {
  if (!hasSavedViewTabs) {
    return (
      <div
        className="setta-workspace-shell-center"
        data-saved-view-tabs="false"
      >
        <div className="setta-workspace-shell-canvas">
          <WorkspaceCanvas configuration={canvas} />
        </div>
      </div>
    );
  }
  return (
    <div className="setta-workspace-shell-center" data-saved-view-tabs="true">
      <div
        aria-label="Active saved view"
        className="setta-workspace-shell-canvas"
        id={savedViewPanelId}
        role="tabpanel"
      >
        <WorkspaceCanvas configuration={canvas} />
      </div>
    </div>
  );
}
