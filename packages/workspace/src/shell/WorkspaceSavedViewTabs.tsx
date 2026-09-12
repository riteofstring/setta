import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSavedView } from "../document/types";
import {
  activateWorkspaceSavedView,
  getWorkspaceSavedViewsOperationDisabledReason,
} from "../saved-views/operations";
import { getOrderedWorkspaceSavedViews } from "../saved-views/state";
import { useWorkspaceHost } from "../workspaceHostContext";

export const WORKSPACE_SAVED_VIEW_TABS_HEIGHT_PX = 36;

type WorkspaceSavedViewTabsProps = {
  panelId: string;
  visible: boolean;
};

function getNavigationIndex(
  key: string,
  currentIndex: number,
  count: number,
): number | null {
  switch (key) {
    case "ArrowLeft":
      return (currentIndex - 1 + count) % count;
    case "ArrowRight":
      return (currentIndex + 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function WorkspaceSavedViewTabs({
  panelId,
  visible,
}: WorkspaceSavedViewTabsProps) {
  const host = useWorkspaceHost();
  const savedViews = useWorkspaceDocument((state) => state.savedViews);
  const views = useMemo(
    () =>
      savedViews
        ? getOrderedWorkspaceSavedViews(savedViews).filter((view) => view.isTab)
        : [],
    [savedViews],
  );
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState("");

  if (!visible || !savedViews || views.length === 0) {
    return null;
  }

  const activeViewId = savedViews.activeViewId;
  const tabStopId = views.some((view) => view.id === activeViewId)
    ? activeViewId
    : views[0]?.id;
  const activationDisabledReason =
    getWorkspaceSavedViewsOperationDisabledReason(host, "activate");

  function activate(view: WorkspaceSavedView): void {
    const result = activateWorkspaceSavedView(host, view.id);
    setStatus(
      result.status === "unavailable"
        ? result.reason
        : `${view.name} is now active.`,
    );
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    view: WorkspaceSavedView,
  ): void {
    const currentIndex = views.findIndex(
      (candidate) => candidate.id === view.id,
    );
    const nextIndex = getNavigationIndex(event.key, currentIndex, views.length);
    if (nextIndex === null) {
      return;
    }
    const nextView = views[nextIndex];
    if (!nextView) {
      throw new Error(
        `Saved view tab navigation resolved no tab at ${nextIndex}.`,
      );
    }
    event.preventDefault();
    buttonRefs.current.get(nextView.id)?.focus();
    if (activationDisabledReason === null) {
      activate(nextView);
    }
  }

  return (
    <nav
      aria-label="Saved view tabs"
      className="setta-workspace-saved-view-tabs"
      data-testid="workspace-saved-view-tabs"
    >
      <div
        aria-label="Saved views"
        aria-orientation="horizontal"
        className="setta-workspace-saved-view-tabs-list"
        role="tablist"
      >
        {views.map((view) => {
          const active = view.id === activeViewId;
          return (
            <button
              key={view.id}
              aria-controls={panelId}
              aria-selected={active}
              className="setta-workspace-saved-view-tab"
              disabled={activationDisabledReason !== null}
              ref={(element) => {
                if (element) {
                  buttonRefs.current.set(view.id, element);
                } else {
                  buttonRefs.current.delete(view.id);
                }
              }}
              role="tab"
              tabIndex={view.id === tabStopId ? 0 : -1}
              title={activationDisabledReason ?? view.name}
              type="button"
              onClick={
                activationDisabledReason === null
                  ? () => activate(view)
                  : undefined
              }
              onKeyDown={(event) => handleKeyDown(event, view)}
            >
              <span>{view.name}</span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </nav>
  );
}
