import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  getSectionChildren,
  getSectionOrThrow,
  getTopLevelSectionIdsForDisplay,
} from "../document/documentSelectors";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useWorkspaceDocument } from "../document/stores";
import {
  activateWorkspaceSavedView,
  createWorkspaceSavedView,
  deleteWorkspaceSavedView,
  getWorkspaceSavedViewsOperationDisabledReason,
  getWorkspaceSavedViewsState,
  renameWorkspaceSavedView,
  reorderWorkspaceSavedView,
  setWorkspaceSavedViewSectionVisibility,
} from "../saved-views/operations";
import { getOrderedWorkspaceSavedViews } from "../saved-views/state";
import type { WorkspaceHost } from "../workspaceHost";
import { useWorkspaceHost } from "../workspaceHostContext";

type WorkspaceSavedViewsPaneProps = {
  ariaLabel?: string;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

type SavedViewsState = NonNullable<
  ReturnType<typeof getWorkspaceSavedViewsState>
>;

type WorkspaceSavedView = SavedViewsState["views"][string];

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
  if (views.some((view) => view.id !== viewId && view.name === name)) {
    return "Saved view names must be unique.";
  }
  return null;
}

function WorkspaceSavedViewSectionVisibilityRow({
  disabledReason,
  sectionId,
  state,
  view,
  onStatus,
}: {
  disabledReason: string | null;
  sectionId: string;
  state: Parameters<typeof getTopLevelSectionIdsForDisplay>[0];
  view: WorkspaceSavedView;
  onStatus: (message: string) => void;
}) {
  const host = useWorkspaceHost();
  const section = getSectionOrThrow(state, sectionId);
  const visible = view.sectionVisibility[sectionId];
  const children = getSectionChildren(state, sectionId);
  const enabled = disabledReason === null;

  function setVisible(nextVisible: boolean): void {
    const result = setWorkspaceSavedViewSectionVisibility(
      host,
      [sectionId],
      nextVisible,
    );
    if (result.status !== "unavailable") {
      onStatus(
        `${section.name} is now ${nextVisible ? "visible" : "hidden"} in ${view.name}.`,
      );
      return;
    }
    onStatus(getUnavailableMessage(disabledReason));
  }

  return (
    <li className="setta-workspace-saved-views-visibility-row">
      <label>
        <input
          aria-label={`${visible ? "Hide" : "Show"} ${section.name}`}
          checked={visible}
          disabled={!enabled}
          title={disabledReason ?? undefined}
          type="checkbox"
          onChange={(event) => setVisible(event.currentTarget.checked)}
        />
        <span>{section.name}</span>
      </label>
      {children.length > 0 ? (
        <ul className="setta-workspace-saved-views-visibility-children">
          {children.map((childId) => (
            <WorkspaceSavedViewSectionVisibilityRow
              disabledReason={disabledReason}
              key={childId}
              sectionId={childId}
              state={state}
              view={view}
              onStatus={onStatus}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function WorkspaceSavedViewNameEditor({
  draft,
  inputRef,
  nameError,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: string;
  inputRef: RefObject<HTMLInputElement | null>;
  nameError: string | null;
  onCancel: () => void;
  onChange: (nextDraft: string) => void;
  onSubmit: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="setta-workspace-saved-views-name-editor">
      <input
        aria-invalid={nameError ? true : undefined}
        aria-label="Saved view name"
        className="setta-workspace-saved-views-name-input"
        ref={inputRef}
        value={draft}
        onBlur={onSubmit}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      {nameError ? (
        <p className="setta-workspace-saved-views-error" role="alert">
          {nameError}
        </p>
      ) : null}
    </div>
  );
}

type WorkspaceSavedViewDisabledReasons = {
  activate: string | null;
  create: string | null;
  delete: string | null;
  rename: string | null;
  reorder: string | null;
  visibility: string | null;
};

type WorkspaceSavedViewActions = {
  activate: (view: WorkspaceSavedView) => void;
  cancelRename: () => void;
  changeName: (nextDraft: string) => void;
  deleteView: (view: WorkspaceSavedView) => void;
  move: (view: WorkspaceSavedView, direction: -1 | 1) => void;
  startRename: (view: WorkspaceSavedView) => void;
  submitRename: (view: WorkspaceSavedView) => void;
};

type WorkspaceSavedViewControlState = {
  disabled: boolean;
  title: string;
};

type WorkspaceSavedViewListProps = {
  actions: WorkspaceSavedViewActions;
  activeViewId: string;
  disabledReasons: WorkspaceSavedViewDisabledReasons;
  inputRef: RefObject<HTMLInputElement | null>;
  lastViewDeleteReason: string | null;
  nameDraft: string;
  nameError: string | null;
  registerViewButton: (
    viewId: string,
    element: HTMLButtonElement | null,
  ) => void;
  renamingViewId: string | null;
  views: ReadonlyArray<WorkspaceSavedView>;
};

function getWorkspaceSavedViewControlState(
  disabledReason: string | null,
  enabledTitle: string,
): WorkspaceSavedViewControlState {
  if (disabledReason !== null) {
    return { disabled: true, title: disabledReason };
  }
  return { disabled: false, title: enabledTitle };
}

function getWorkspaceSavedViewBoundaryDisabledReason(
  disabledReason: string | null,
  atBoundary: boolean,
  boundaryTitle: string,
): string | null {
  if (disabledReason !== null) {
    return disabledReason;
  }
  if (atBoundary) {
    return boundaryTitle;
  }
  return null;
}

function WorkspaceSavedViewRow({
  actions,
  activeViewId,
  disabledReasons,
  index,
  inputRef,
  lastViewDeleteReason,
  nameDraft,
  nameError,
  registerViewButton,
  renamingViewId,
  view,
  viewCount,
}: Omit<WorkspaceSavedViewListProps, "views"> & {
  index: number;
  view: WorkspaceSavedView;
  viewCount: number;
}) {
  const active = view.id === activeViewId;
  const renaming = view.id === renamingViewId;
  const activateControl = getWorkspaceSavedViewControlState(
    disabledReasons.activate,
    `Activate ${view.name}`,
  );
  const renameControl = getWorkspaceSavedViewControlState(
    disabledReasons.rename,
    `Rename ${view.name}`,
  );
  const upControl = getWorkspaceSavedViewControlState(
    getWorkspaceSavedViewBoundaryDisabledReason(
      disabledReasons.reorder,
      index === 0,
      "Already first",
    ),
    `Move ${view.name} up`,
  );
  const downControl = getWorkspaceSavedViewControlState(
    getWorkspaceSavedViewBoundaryDisabledReason(
      disabledReasons.reorder,
      index === viewCount - 1,
      "Already last",
    ),
    `Move ${view.name} down`,
  );
  const deleteControl = getWorkspaceSavedViewControlState(
    disabledReasons.delete ?? lastViewDeleteReason,
    `Delete ${view.name}`,
  );

  return (
    <div
      className="setta-workspace-saved-views-row"
      data-active={String(active)}
      data-workspace-saved-view-id={view.id}
      role="listitem"
    >
      {renaming ? (
        <WorkspaceSavedViewNameEditor
          draft={nameDraft}
          inputRef={inputRef}
          nameError={nameError}
          onCancel={actions.cancelRename}
          onChange={actions.changeName}
          onSubmit={() => actions.submitRename(view)}
        />
      ) : (
        <button
          aria-pressed={active}
          className="setta-workspace-saved-views-activate"
          disabled={activateControl.disabled}
          ref={(element) => registerViewButton(view.id, element)}
          title={activateControl.title}
          type="button"
          onClick={
            activateControl.disabled ? undefined : () => actions.activate(view)
          }
        >
          {view.name}
        </button>
      )}
      <div className="setta-workspace-saved-views-row-actions">
        <button
          aria-label={`Rename ${view.name}`}
          disabled={renameControl.disabled}
          title={renameControl.title}
          type="button"
          onClick={
            renameControl.disabled ? undefined : () => actions.startRename(view)
          }
        >
          Rename
        </button>
        <button
          aria-label={`Move ${view.name} up`}
          disabled={upControl.disabled}
          title={upControl.title}
          type="button"
          onClick={
            upControl.disabled ? undefined : () => actions.move(view, -1)
          }
        >
          Up
        </button>
        <button
          aria-label={`Move ${view.name} down`}
          disabled={downControl.disabled}
          title={downControl.title}
          type="button"
          onClick={
            downControl.disabled ? undefined : () => actions.move(view, 1)
          }
        >
          Down
        </button>
        <button
          aria-label={`Delete ${view.name}`}
          disabled={deleteControl.disabled}
          title={deleteControl.title}
          type="button"
          onClick={
            deleteControl.disabled ? undefined : () => actions.deleteView(view)
          }
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function WorkspaceSavedViewsList(props: WorkspaceSavedViewListProps) {
  const { views, ...rowProps } = props;
  return (
    <div className="setta-workspace-saved-views-list" role="list">
      {views.map((view, index) => (
        <WorkspaceSavedViewRow
          {...rowProps}
          index={index}
          key={view.id}
          view={view}
          viewCount={views.length}
        />
      ))}
    </div>
  );
}

function WorkspaceSavedViewsEditNotice({
  disabledReason,
}: {
  disabledReason: string | null;
}) {
  if (disabledReason === null) {
    return null;
  }
  return (
    <p className="setta-workspace-saved-views-disabled" role="status">
      {disabledReason} You can still switch views.
    </p>
  );
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
  const createDisabledReason = disabledReasons.create;
  const activateDisabledReason = disabledReasons.activate;
  const renameDisabledReason = disabledReasons.rename;
  const deleteDisabledReason = disabledReasons.delete;
  const reorderDisabledReason = disabledReasons.reorder;
  const visibilityDisabledReason = disabledReasons.visibility;
  const lastViewDeleteReason =
    views.length === 1 ? "The last saved view cannot be deleted." : null;

  useEffect(() => {
    if (renamingViewId && !savedViews?.views[renamingViewId]) {
      setRenamingViewId(null);
      setNameError(null);
    }
  }, [renamingViewId, savedViews]);

  useEffect(() => {
    if (renamingViewId) {
      nameInputRef.current?.focus({ preventScroll: true });
      nameInputRef.current?.select();
    }
  }, [renamingViewId]);

  useLayoutEffect(() => {
    if (!initialFocusRef) {
      return;
    }
    const target =
      (createDisabledReason === null
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
  }, [createDisabledReason, initialFocusRef, savedViews, views]);

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
    setStatus(getUnavailableMessage(activateDisabledReason));
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
    setStatus(getUnavailableMessage(createDisabledReason));
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
    setNameError(getUnavailableMessage(renameDisabledReason));
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
    setStatus(getUnavailableMessage(deleteDisabledReason));
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
    setStatus(getUnavailableMessage(reorderDisabledReason));
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
          {getUnavailableMessage(createDisabledReason)}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      className={joinClassNames("setta-workspace-saved-views-pane", className)}
      data-testid="workspace-saved-views-pane"
    >
      <header className="setta-workspace-saved-views-heading">
        <div>
          <h2>Saved Views</h2>
          <p>Switch the canvas presentation or edit the active view.</p>
        </div>
        <button
          className="setta-workspace-saved-views-create"
          disabled={createDisabledReason !== null}
          ref={createActionRef}
          title={createDisabledReason ?? "Create a saved view"}
          type="button"
          onClick={createDisabledReason === null ? create : undefined}
        >
          Create view
        </button>
      </header>
      <WorkspaceSavedViewsEditNotice disabledReason={createDisabledReason} />
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
        inputRef={nameInputRef}
        lastViewDeleteReason={lastViewDeleteReason}
        nameDraft={nameDraft}
        nameError={nameError}
        registerViewButton={registerViewButton}
        renamingViewId={renamingViewId}
        views={views}
      />
      <section
        aria-label={`Visible sections in ${activeView.name}`}
        className="setta-workspace-saved-views-visibility"
      >
        <h3>Visible sections in {activeView.name}</h3>
        <p>Hidden parents remove their rendered subtree.</p>
        <ul>
          {getTopLevelSectionIdsForDisplay(documentState).map((sectionId) => (
            <WorkspaceSavedViewSectionVisibilityRow
              disabledReason={visibilityDisabledReason}
              key={sectionId}
              sectionId={sectionId}
              state={documentState}
              view={activeView}
              onStatus={setStatus}
            />
          ))}
        </ul>
      </section>
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </section>
  );
}

export type { WorkspaceSavedViewsPaneProps };
