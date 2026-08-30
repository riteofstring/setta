import { WorkspaceCanvas } from "../canvas/WorkspaceCanvas";
import { useWorkspaceDocument } from "../document/stores";
import { WORKSPACE_SAVED_VIEW_TABS_HEIGHT_PX } from "./WorkspaceSavedViewTabs";

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
  hasSavedViewTabs,
  savedViewPanelId,
}: {
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
          <WorkspaceCanvas />
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
        <WorkspaceCanvas />
      </div>
    </div>
  );
}
