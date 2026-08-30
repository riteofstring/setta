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

export function WorkspaceSavedViewsPane({
  ariaLabel = "Saved Views",
  className,
  initialFocusRef,
}: WorkspaceSavedViewsPaneProps) {
  const host = useWorkspaceHost();
  const documentState = useWorkspaceDocument((state) => state);
  const layoutEditingEnabled = useWorkspaceCapabilities(
    (capabilities) => capabilities.canEditLayout,
  );
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
  const disabledReasons = useMemo(
    () => ({
      activate: getWorkspaceSavedViewsOperationDisabledReason(host, "activate"),
      create: getWorkspaceSavedViewsOperationDisabledReason(host, "create"),
      delete: getWorkspaceSavedViewsOperationDisabledReason(host, "delete"),
      rename: getWorkspaceSavedViewsOperationDisabledReason(host, "rename"),
      reorder: getWorkspaceSavedViewsOperationDisabledReason(host, "reorder"),
      visibility: getWorkspaceSavedViewsOperationDisabledReason(
        host,
        "visibility",
      ),
    }),
    [host, layoutEditingEnabled, savedViews],
  );
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
      {createDisabledReason ? (
        <p className="setta-workspace-saved-views-disabled" role="status">
          {createDisabledReason} You can still switch views.
        </p>
      ) : null}
      <div className="setta-workspace-saved-views-list" role="list">
        {views.map((view, index) => {
          const active = view.id === activeView.id;
          const renaming = renamingViewId === view.id;
          return (
            <div
              className="setta-workspace-saved-views-row"
              data-active={active ? "true" : "false"}
              data-workspace-saved-view-id={view.id}
              key={view.id}
              role="listitem"
            >
              {renaming ? (
                <WorkspaceSavedViewNameEditor
                  draft={nameDraft}
                  inputRef={nameInputRef}
                  nameError={nameError}
                  onCancel={cancelRename}
                  onChange={(nextDraft) => {
                    setNameDraft(nextDraft);
                    setNameError(null);
                  }}
                  onSubmit={() => submitRename(view)}
                />
              ) : (
                <button
                  aria-pressed={active}
                  className="setta-workspace-saved-views-activate"
                  disabled={activateDisabledReason !== null}
                  ref={(element) => registerViewButton(view.id, element)}
                  title={activateDisabledReason ?? `Activate ${view.name}`}
                  type="button"
                  onClick={
                    activateDisabledReason === null
                      ? () => activate(view)
                      : undefined
                  }
                >
                  {view.name}
                </button>
              )}
              <div className="setta-workspace-saved-views-row-actions">
                <button
                  aria-label={`Rename ${view.name}`}
                  disabled={renameDisabledReason !== null}
                  title={renameDisabledReason ?? `Rename ${view.name}`}
                  type="button"
                  onClick={
                    renameDisabledReason === null
                      ? () => startRename(view)
                      : undefined
                  }
                >
                  Rename
                </button>
                <button
                  aria-label={`Move ${view.name} up`}
                  disabled={reorderDisabledReason !== null || index === 0}
                  title={
                    reorderDisabledReason ??
                    (index === 0 ? "Already first" : `Move ${view.name} up`)
                  }
                  type="button"
                  onClick={
                    reorderDisabledReason === null && index > 0
                      ? () => move(view, -1)
                      : undefined
                  }
                >
                  Up
                </button>
                <button
                  aria-label={`Move ${view.name} down`}
                  disabled={
                    reorderDisabledReason !== null || index === views.length - 1
                  }
                  title={
                    reorderDisabledReason ??
                    (index === views.length - 1
                      ? "Already last"
                      : `Move ${view.name} down`)
                  }
                  type="button"
                  onClick={
                    reorderDisabledReason === null && index < views.length - 1
                      ? () => move(view, 1)
                      : undefined
                  }
                >
                  Down
                </button>
                <button
                  aria-label={`Delete ${view.name}`}
                  disabled={
                    deleteDisabledReason !== null ||
                    lastViewDeleteReason !== null
                  }
                  title={
                    deleteDisabledReason ??
                    lastViewDeleteReason ??
                    `Delete ${view.name}`
                  }
                  type="button"
                  onClick={
                    deleteDisabledReason === null &&
                    lastViewDeleteReason === null
                      ? () => deleteView(view)
                      : undefined
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
