import { GitPane } from "components/Panes/Overview/Git/GitPane";
import { useEffect } from "react";
import { ensureGitGraphStateLoaded } from "state/actions/git";
import { useMisc, useProjectState } from "state/definitions";
import { GitGraphOverlay } from "./GitGraphOverlay";

type GitGraphWindowContentProps = {
  instanceId?: string | null;
  showEmbeddedGitPaneToggle?: boolean;
  embeddedGitPaneVisible?: boolean;
  onEmbeddedGitPaneVisibleChange?: (visible: boolean) => void;
};

export function GitGraphWindowContent({
  instanceId = null,
  showEmbeddedGitPaneToggle = false,
  embeddedGitPaneVisible,
  onEmbeddedGitPaneVisibleChange,
}: GitGraphWindowContentProps) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);

  useEffect(() => {
    void ensureGitGraphStateLoaded();
  }, [projectConfigId]);

  const storedEmbeddedGitPaneVisible = useMisc((state) => {
    if (!instanceId) {
      return false;
    }
    return (
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId[instanceId] ===
      true
    );
  });
  const isControlledEmbeddedGitPane =
    embeddedGitPaneVisible !== undefined &&
    onEmbeddedGitPaneVisibleChange !== undefined;
  const isEmbeddedGitPaneVisible =
    embeddedGitPaneVisible ?? storedEmbeddedGitPaneVisible;

  function toggleEmbeddedGitPane(): void {
    if (!instanceId) {
      return;
    }
    if (isControlledEmbeddedGitPane) {
      onEmbeddedGitPaneVisibleChange?.(!isEmbeddedGitPaneVisible);
      return;
    }
    useMisc.setState((state) => {
      const nextVisibilityByInstanceId = {
        ...state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
      };
      if (nextVisibilityByInstanceId[instanceId]) {
        delete nextVisibilityByInstanceId[instanceId];
      } else {
        nextVisibilityByInstanceId[instanceId] = true;
      }
      return {
        ...state,
        projectChatGitGraphEmbeddedPaneVisibleByInstanceId:
          nextVisibilityByInstanceId,
      };
    });
  }

  return (
    <GitGraphOverlay
      embedded
      showCloseButton={false}
      extraHeaderActions={
        showEmbeddedGitPaneToggle && instanceId ? (
          <button
            type="button"
            data-testid="git-graph-toggle-embedded-git-pane"
            aria-label={
              isEmbeddedGitPaneVisible
                ? "Hide git pane sidebar"
                : "Show git pane sidebar"
            }
            aria-pressed={isEmbeddedGitPaneVisible}
            className={`rounded-md px-2 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
              isEmbeddedGitPaneVisible
                ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-50"
                : "text-setta-600 hover:bg-setta-100 hover:text-setta-900 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
            }`}
            onClick={toggleEmbeddedGitPane}
          >
            Git pane
          </button>
        ) : null
      }
      leftSidebar={
        isEmbeddedGitPaneVisible ? (
          <div className="min-h-0 flex-1 p-3">
            <GitPane showGraphButton={false} />
          </div>
        ) : null
      }
    />
  );
}
