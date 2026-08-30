import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSavedView } from "../document/types";
import { setWorkspaceSavedViewEditing } from "../saved-views/editing";
import { useWorkspaceSavedViewEditing } from "../saved-views/editingState";
import {
  activateWorkspaceSavedView,
  createWorkspaceSavedView,
  deleteWorkspaceSavedView,
  getWorkspaceSavedViewsOperationDisabledReason,
  getWorkspaceSavedViewsState,
  renameWorkspaceSavedView,
  reorderWorkspaceSavedView,
} from "../saved-views/operations";
import { getOrderedWorkspaceSavedViews } from "../saved-views/state";
import type { WorkspaceHost } from "../workspaceHost";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  WorkspaceSavedViewsEditNotice,
  WorkspaceSavedViewsHeader,
  WorkspaceSavedViewsList,
  WorkspaceSavedViewsVisibility,
  type WorkspaceSavedViewDisabledReasons,
} from "./WorkspaceSavedViewsPaneParts";

type WorkspaceSavedViewsPaneProps = {
  ariaLabel?: string;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | false | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

function getUnavailableMessage(reason: string | null): string {
  return reason ?? "Saved views are unavailable in this workspace.";
}

function getNameValidationError(
  viewId: string,
  draft: string,
  views: ReadonlyArray<WorkspaceSavedView>,
): string | null {
  const name = draft.trim();
  if (name === "") {
    return "A saved view name is required.";
  }
  return views.some((view) => view.id !== viewId && view.name === name)
    ? "Saved view names must be unique."
    : null;
}

function useWorkspaceSavedViewDisabledReasons(
  host: WorkspaceHost,
): WorkspaceSavedViewDisabledReasons {
  useWorkspaceCapabilities((capabilities) => capabilities.canEditLayout);
  return {
    activate: getWorkspaceSavedViewsOperationDisabledReason(host, "activate"),
    create: getWorkspaceSavedViewsOperationDisabledReason(host, "create"),
    delete: getWorkspaceSavedViewsOperationDisabledReason(host, "delete"),
    rename: getWorkspaceSavedViewsOperationDisabledReason(host, "rename"),
    reorder: getWorkspaceSavedViewsOperationDisabledReason(host, "reorder"),
    visibility: getWorkspaceSavedViewsOperationDisabledReason(
      host,
      "visibility",
    ),
  };
}

export function WorkspaceSavedViewsPane({
  ariaLabel = "Saved Views",
  className,
  initialFocusRef,
}: WorkspaceSavedViewsPaneProps) {
  const host = useWorkspaceHost();
  const documentState = useWorkspaceDocument((state) => state);
  const savedViews = documentState.savedViews;
  const views = useMemo(
    () => (savedViews ? getOrderedWorkspaceSavedViews(savedViews) : []),
    [savedViews],
  );
  const activeView = savedViews
    ? (savedViews.views[savedViews.activeViewId] ?? null)
    : null;
  const editing = useWorkspaceSavedViewEditing();
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const createActionRef = useRef<HTMLButtonElement>(null);
  const unavailableFocusRef = useRef<HTMLElement>(null);
  const viewButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const requestedFocusViewIdRef = useRef<string | null>(null);
  const suppressRenameSubmitRef = useRef(false);
  const disabledReasons = useWorkspaceSavedViewDisabledReasons(host);
  const lastViewDeleteReason =
    views.length === 1 ? "The last saved view cannot be deleted." : null;

  useEffect(() => {
    if (renamingViewId && (!editing || !savedViews?.views[renamingViewId])) {
      setRenamingViewId(null);
      setNameError(null);
    }
  }, [editing, renamingViewId, savedViews]);

  useEffect(() => {
    if (renamingViewId) {
      nameInputRef.current?.focus({ preventScroll: true });
      nameInputRef.current?.select();
    }
  }, [renamingViewId]);

  useEffect(() => {
    if (editing && disabledReasons.visibility !== null) {
      setWorkspaceSavedViewEditing(host, false);
      setStatus(disabledReasons.visibility);
    }
  }, [disabledReasons.visibility, editing, host]);

  useEffect(
    () => () => {
      setWorkspaceSavedViewEditing(host, false);
    },
    [host],
  );

  useLayoutEffect(() => {
    if (!initialFocusRef) {
      return;
    }
    const target =
      (disabledReasons.create === null
        ? createActionRef.current
        : views
            .map((view) => viewButtonRefs.current.get(view.id))
            .find((button) => button?.disabled === false)) ??
      unavailableFocusRef.current;
    initialFocusRef.current = target;
    return () => {
      if (initialFocusRef.current === target) {
        initialFocusRef.current = null;
      }
    };
  }, [disabledReasons.create, initialFocusRef, savedViews, views]);

  useLayoutEffect(() => {
    const requestedViewId = requestedFocusViewIdRef.current;
    if (!requestedViewId) {
      return;
    }
    const target = viewButtonRefs.current.get(requestedViewId);
    if (!target) {
      return;
    }
    requestedFocusViewIdRef.current = null;
    target.focus({ preventScroll: true });
  }, [renamingViewId, savedViews]);

  function registerViewButton(
    viewId: string,
    element: HTMLButtonElement | null,
  ): void {
    if (element) {
      viewButtonRefs.current.set(viewId, element);
      return;
    }
    viewButtonRefs.current.delete(viewId);
  }

  function activate(view: WorkspaceSavedView): void {
    const result = activateWorkspaceSavedView(host, view.id);
    if (result.status !== "unavailable") {
      requestedFocusViewIdRef.current = view.id;
      setStatus(`${view.name} is now active.`);
      return;
    }
    setStatus(getUnavailableMessage(disabledReasons.activate));
  }

  function create(): void {
    const result = createWorkspaceSavedView(host);
    const nextState = getWorkspaceSavedViewsState(host);
    const createdView = nextState?.views[nextState.activeViewId];
    if (result.status !== "unavailable" && createdView) {
      requestedFocusViewIdRef.current = createdView.id;
      setStatus(`${createdView.name} was created and activated.`);
      return;
    }
    setStatus(getUnavailableMessage(disabledReasons.create));
  }

  function startRename(view: WorkspaceSavedView): void {
    setRenamingViewId(view.id);
    setNameDraft(view.name);
    setNameError(null);
  }

  function cancelRename(): void {
    const viewId = renamingViewId;
    suppressRenameSubmitRef.current = true;
    setRenamingViewId(null);
    setNameError(null);
    if (viewId) {
      requestedFocusViewIdRef.current = viewId;
    }
  }

  function submitRename(view: WorkspaceSavedView): void {
    if (suppressRenameSubmitRef.current) {
      suppressRenameSubmitRef.current = false;
      return;
    }
    const nextError = getNameValidationError(view.id, nameDraft, views);
    if (nextError) {
      setNameError(nextError);
      return;
    }
    const nextName = nameDraft.trim();
    const result = renameWorkspaceSavedView(host, view.id, nextName);
    if (result.status !== "unavailable") {
      requestedFocusViewIdRef.current = view.id;
      setRenamingViewId(null);
      setNameError(null);
      setStatus(`Renamed saved view to ${nextName}.`);
      return;
    }
    setNameError(getUnavailableMessage(disabledReasons.rename));
  }

  function deleteView(view: WorkspaceSavedView): void {
    const result = deleteWorkspaceSavedView(host, view.id);
    const nextState = getWorkspaceSavedViewsState(host);
    const nextActiveView = nextState?.views[nextState.activeViewId];
    if (result.status !== "unavailable") {
      requestedFocusViewIdRef.current = nextActiveView?.id ?? null;
      setStatus(`Deleted ${view.name}.`);
      return;
    }
    setStatus(getUnavailableMessage(disabledReasons.delete));
  }

  function move(view: WorkspaceSavedView, direction: -1 | 1): void {
    const index = views.findIndex((candidate) => candidate.id === view.id);
    const target = views[index + direction];
    if (!target) {
      return;
    }
    const result = reorderWorkspaceSavedView(host, view.id, target.sortIndex);
    if (result.status !== "unavailable") {
      requestedFocusViewIdRef.current = view.id;
      setStatus(
        `Moved ${view.name} ${direction === -1 ? "up" : "down"} in saved views.`,
      );
      return;
    }
    setStatus(getUnavailableMessage(disabledReasons.reorder));
  }

  function toggleEditing(): void {
    const nextEditing = !editing;
    if (!setWorkspaceSavedViewEditing(host, nextEditing)) {
      setStatus(getUnavailableMessage(disabledReasons.visibility));
      return;
    }
    if (!nextEditing) {
      setRenamingViewId(null);
      setNameError(null);
    }
    setStatus(
      nextEditing
        ? `Editing ${activeView?.name ?? "the active view"}. Hidden sections are dimmed on the canvas.`
        : "Finished editing the saved view.",
    );
  }

  if (!savedViews || !activeView) {
    return (
      <section
        aria-label={ariaLabel}
        className={joinClassNames(
          "setta-workspace-saved-views-pane",
          className,
        )}
        data-testid="workspace-saved-views-pane"
        ref={unavailableFocusRef}
        tabIndex={0}
      >
        <h2>Saved Views</h2>
        <p className="setta-workspace-saved-views-unavailable" role="status">
          {getUnavailableMessage(disabledReasons.create)}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      className={joinClassNames("setta-workspace-saved-views-pane", className)}
      data-testid="workspace-saved-views-pane"
      data-workspace-saved-view-editing={String(editing)}
    >
      <WorkspaceSavedViewsHeader
        createDisabledReason={disabledReasons.create}
        createRef={createActionRef}
        editing={editing}
        visibilityDisabledReason={disabledReasons.visibility}
        onCreate={create}
        onToggleEditing={toggleEditing}
      />
      <WorkspaceSavedViewsEditNotice
        disabledReason={disabledReasons.visibility}
      />
      {editing ? (
        <p className="setta-workspace-saved-views-guidance">
          Dimmed sections are hidden from this view. Use each section&apos;s eye
          control to show or hide it.
        </p>
      ) : null}
      <WorkspaceSavedViewsList
        actions={{
          activate,
          cancelRename,
          changeName: (nextDraft) => {
            setNameDraft(nextDraft);
            setNameError(null);
          },
          deleteView,
          move,
          startRename,
          submitRename,
        }}
        activeViewId={activeView.id}
        disabledReasons={disabledReasons}
        editing={editing}
        inputRef={nameInputRef}
        lastViewDeleteReason={lastViewDeleteReason}
        nameDraft={nameDraft}
        nameError={nameError}
        registerViewButton={registerViewButton}
        renamingViewId={renamingViewId}
        views={views}
      />
      {editing ? (
        <WorkspaceSavedViewsVisibility
          disabledReason={disabledReasons.visibility}
          state={documentState}
          view={activeView}
          onStatus={setStatus}
        />
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </section>
  );
}

export type { WorkspaceSavedViewsPaneProps };
