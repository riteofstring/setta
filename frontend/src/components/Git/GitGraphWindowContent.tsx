import { GitPane } from "components/Panes/Overview/Git/GitPane";
import { useEffect } from "react";
import { ensureGitGraphStateLoaded } from "state/actions/git";
import { buildProjectChatEphemeralWindowInstanceKey } from "state/actions/projectChatWindowingEphemeral";
import { useMisc, useProjectState } from "state/definitions";
import { GitGraphOverlay } from "./GitGraphOverlay";

type GitGraphWindowContentProps = {
  instanceId?: string | null;
  showEmbeddedGitPaneToggle?: boolean;
  embeddedGitPaneVisible?: boolean;
  onEmbeddedGitPaneVisibleChange?: (visible: boolean) => void;
};

type EmbeddedGitPaneVisibility = {
  isControlled: boolean;
  isVisible: boolean;
};

function resolveEmbeddedGitPaneKey(
  projectConfigId: string,
  instanceId: string | null,
): string | null {
  if (!instanceId) {
    return null;
  }
  return buildProjectChatEphemeralWindowInstanceKey(
    projectConfigId,
    instanceId,
  );
}

function isStoredEmbeddedGitPaneVisible(
  visibilityByInstanceId: Record<string, boolean>,
  embeddedGitPaneKey: string | null,
): boolean {
  if (!embeddedGitPaneKey) {
    return false;
  }
  return visibilityByInstanceId[embeddedGitPaneKey] === true;
}

function toggleStoredEmbeddedGitPane(embeddedGitPaneKey: string): void {
  useMisc.setState((state) => {
    const nextVisibilityByInstanceId = {
      ...state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    };
    if (nextVisibilityByInstanceId[embeddedGitPaneKey]) {
      delete nextVisibilityByInstanceId[embeddedGitPaneKey];
    } else {
      nextVisibilityByInstanceId[embeddedGitPaneKey] = true;
    }
    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId:
        nextVisibilityByInstanceId,
    };
  });
}

function resolveEmbeddedGitPaneVisibility({
  embeddedGitPaneVisible,
  onEmbeddedGitPaneVisibleChange,
  storedEmbeddedGitPaneVisible,
}: {
  embeddedGitPaneVisible: boolean | undefined;
  onEmbeddedGitPaneVisibleChange: ((visible: boolean) => void) | undefined;
  storedEmbeddedGitPaneVisible: boolean;
}): EmbeddedGitPaneVisibility {
  const isControlled =
    embeddedGitPaneVisible !== undefined &&
    onEmbeddedGitPaneVisibleChange !== undefined;
  return {
    isControlled,
    isVisible: embeddedGitPaneVisible ?? storedEmbeddedGitPaneVisible,
  };
}

function toggleEmbeddedGitPaneVisibility({
  embeddedGitPaneKey,
  visibility,
  onEmbeddedGitPaneVisibleChange,
}: {
  embeddedGitPaneKey: string | null;
  visibility: EmbeddedGitPaneVisibility;
  onEmbeddedGitPaneVisibleChange: ((visible: boolean) => void) | undefined;
}): void {
  if (visibility.isControlled) {
    onEmbeddedGitPaneVisibleChange?.(!visibility.isVisible);
    return;
  }
  if (embeddedGitPaneKey) {
    toggleStoredEmbeddedGitPane(embeddedGitPaneKey);
  }
}

function EmbeddedGitPaneToggleButton({
  isVisible,
  onToggle,
}: {
  isVisible: boolean;
  onToggle: () => void;
}) {
  const accessibilityLabel = isVisible
    ? "Hide git pane sidebar"
    : "Show git pane sidebar";
  const buttonClasses = isVisible
    ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-50"
    : "text-setta-600 hover:bg-setta-100 hover:text-setta-900 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50";

  return (
    <button
      type="button"
      data-testid="git-graph-toggle-embedded-git-pane"
      aria-label={accessibilityLabel}
      aria-pressed={isVisible}
      className={`rounded-md px-2 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${buttonClasses}`}
      onClick={onToggle}
    >
      Git pane
    </button>
  );
}

export function GitGraphWindowContent({
  instanceId = null,
  showEmbeddedGitPaneToggle = false,
  embeddedGitPaneVisible,
  onEmbeddedGitPaneVisibleChange,
}: GitGraphWindowContentProps) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const embeddedGitPaneKey = resolveEmbeddedGitPaneKey(
    projectConfigId,
    instanceId,
  );

  useEffect(() => {
    void ensureGitGraphStateLoaded();
  }, [projectConfigId]);

  const storedEmbeddedGitPaneVisible = useMisc((state) =>
    isStoredEmbeddedGitPaneVisible(
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
      embeddedGitPaneKey,
    ),
  );
  const embeddedGitPaneVisibility = resolveEmbeddedGitPaneVisibility({
    embeddedGitPaneVisible,
    onEmbeddedGitPaneVisibleChange,
    storedEmbeddedGitPaneVisible,
  });
  const shouldShowEmbeddedGitPaneToggle =
    showEmbeddedGitPaneToggle && Boolean(instanceId);
  const handleEmbeddedGitPaneToggle = () => {
    toggleEmbeddedGitPaneVisibility({
      embeddedGitPaneKey,
      visibility: embeddedGitPaneVisibility,
      onEmbeddedGitPaneVisibleChange,
    });
  };

  return (
    <GitGraphOverlay
      embedded
      showCloseButton={false}
      extraHeaderActions={
        shouldShowEmbeddedGitPaneToggle ? (
          <EmbeddedGitPaneToggleButton
            isVisible={embeddedGitPaneVisibility.isVisible}
            onToggle={handleEmbeddedGitPaneToggle}
          />
        ) : null
      }
      leftSidebar={
        embeddedGitPaneVisibility.isVisible ? (
          <div className="min-h-0 flex-1 p-3">
            <GitPane showGraphButton={false} />
          </div>
        ) : null
      }
    />
  );
}
