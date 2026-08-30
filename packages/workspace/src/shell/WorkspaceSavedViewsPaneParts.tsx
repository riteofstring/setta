import { type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  FiArrowDown,
  FiArrowUp,
  FiCheck,
  FiChevronDown,
  FiEdit3,
  FiLayers,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import {
  getSectionChildren,
  getSectionOrThrow,
  getTopLevelSectionIdsForDisplay,
} from "../document/documentSelectors";
import type { WorkspaceDocumentState } from "../document/stores";
import type { WorkspaceSavedView } from "../document/types";
import { setWorkspaceSavedViewSectionVisibility } from "../saved-views/operations";
import { useWorkspaceHost } from "../workspaceHostContext";

export type WorkspaceSavedViewDisabledReasons = {
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

function getControlState(
  disabledReason: string | null,
  enabledTitle: string,
): { disabled: boolean; title: string } {
  return disabledReason === null
    ? { disabled: false, title: enabledTitle }
    : { disabled: true, title: disabledReason };
}

function getBoundaryReason(
  disabledReason: string | null,
  atBoundary: boolean,
  boundaryTitle: string,
): string | null {
  if (disabledReason !== null) {
    return disabledReason;
  }
  return atBoundary ? boundaryTitle : null;
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

function WorkspaceSavedViewActionButton({
  children,
  control,
  label,
  onClick,
  tone,
}: {
  children: ReactNode;
  control: { disabled: boolean; title: string };
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      aria-label={label}
      className="setta-workspace-saved-views-icon-button"
      data-tone={tone}
      disabled={control.disabled}
      title={control.title}
      type="button"
      onClick={control.disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}

function WorkspaceSavedViewRow({
  actions,
  activeViewId,
  disabledReasons,
  editing,
  index,
  inputRef,
  lastViewDeleteReason,
  nameDraft,
  nameError,
  registerViewButton,
  renamingViewId,
  view,
  viewCount,
}: WorkspaceSavedViewsListProps & {
  index: number;
  view: WorkspaceSavedView;
  viewCount: number;
}) {
  const active = view.id === activeViewId;
  const renaming = editing && view.id === renamingViewId;
  const activateControl = getControlState(
    disabledReasons.activate,
    `Activate ${view.name}`,
  );
  const renameControl = getControlState(
    disabledReasons.rename,
    `Rename ${view.name}`,
  );
  const upControl = getControlState(
    getBoundaryReason(disabledReasons.reorder, index === 0, "Already first"),
    `Move ${view.name} up`,
  );
  const downControl = getControlState(
    getBoundaryReason(
      disabledReasons.reorder,
      index === viewCount - 1,
      "Already last",
    ),
    `Move ${view.name} down`,
  );
  const deleteControl = getControlState(
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
          <span className="setta-workspace-saved-views-active-icon">
            {active ? <FiCheck aria-hidden="true" /> : null}
          </span>
          <span>{view.name}</span>
        </button>
      )}
      {editing && !renaming ? (
        <div className="setta-workspace-saved-views-row-actions">
          <WorkspaceSavedViewActionButton
            control={renameControl}
            label={`Rename ${view.name}`}
            onClick={() => actions.startRename(view)}
          >
            <FiEdit3 aria-hidden="true" />
          </WorkspaceSavedViewActionButton>
          <WorkspaceSavedViewActionButton
            control={upControl}
            label={`Move ${view.name} up`}
            onClick={() => actions.move(view, -1)}
          >
            <FiArrowUp aria-hidden="true" />
          </WorkspaceSavedViewActionButton>
          <WorkspaceSavedViewActionButton
            control={downControl}
            label={`Move ${view.name} down`}
            onClick={() => actions.move(view, 1)}
          >
            <FiArrowDown aria-hidden="true" />
          </WorkspaceSavedViewActionButton>
          <WorkspaceSavedViewActionButton
            control={deleteControl}
            label={`Delete ${view.name}`}
            tone="danger"
            onClick={() => actions.deleteView(view)}
          >
            <FiTrash2 aria-hidden="true" />
          </WorkspaceSavedViewActionButton>
        </div>
      ) : null}
    </div>
  );
}

type WorkspaceSavedViewsListProps = {
  actions: WorkspaceSavedViewActions;
  activeViewId: string;
  disabledReasons: WorkspaceSavedViewDisabledReasons;
  editing: boolean;
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

export function WorkspaceSavedViewsList(props: WorkspaceSavedViewsListProps) {
  return (
    <div className="setta-workspace-saved-views-list" role="list">
      {props.views.map((view, index) => (
        <WorkspaceSavedViewRow
          {...props}
          index={index}
          key={view.id}
          view={view}
          viewCount={props.views.length}
        />
      ))}
    </div>
  );
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
  state: WorkspaceDocumentState;
  view: WorkspaceSavedView;
  onStatus: (message: string) => void;
}) {
  const host = useWorkspaceHost();
  const section = getSectionOrThrow(state, sectionId);
  const visible = view.sectionVisibility[sectionId];
  const children = getSectionChildren(state, sectionId);

  function setVisible(nextVisible: boolean): void {
    const result = setWorkspaceSavedViewSectionVisibility(
      host,
      [sectionId],
      nextVisible,
    );
    onStatus(
      result.status === "unavailable"
        ? (disabledReason ?? "Saved views are unavailable in this workspace.")
        : `${section.name} is now ${nextVisible ? "visible" : "hidden"} in ${view.name}.`,
    );
  }

  return (
    <li className="setta-workspace-saved-views-visibility-row">
      <label>
        <input
          aria-label={`${visible ? "Hide" : "Show"} ${section.name}`}
          checked={visible}
          disabled={disabledReason !== null}
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

export function WorkspaceSavedViewsVisibility({
  disabledReason,
  state,
  view,
  onStatus,
}: {
  disabledReason: string | null;
  state: WorkspaceDocumentState;
  view: WorkspaceSavedView;
  onStatus: (message: string) => void;
}) {
  return (
    <details className="setta-workspace-saved-views-visibility">
      <summary>
        <span>
          <FiLayers aria-hidden="true" />
          Sections
        </span>
        <span className="setta-workspace-saved-views-visibility-summary">
          Full list
        </span>
        <FiChevronDown
          aria-hidden="true"
          className="setta-workspace-saved-views-visibility-chevron"
        />
      </summary>
      <p>
        Use the canvas controls first. This list is available for precision.
      </p>
      <ul>
        {getTopLevelSectionIdsForDisplay(state).map((sectionId) => (
          <WorkspaceSavedViewSectionVisibilityRow
            disabledReason={disabledReason}
            key={sectionId}
            sectionId={sectionId}
            state={state}
            view={view}
            onStatus={onStatus}
          />
        ))}
      </ul>
    </details>
  );
}

export function WorkspaceSavedViewsHeader({
  createDisabledReason,
  createRef,
  editing,
  visibilityDisabledReason,
  onCreate,
  onToggleEditing,
}: {
  createDisabledReason: string | null;
  createRef: RefObject<HTMLButtonElement | null>;
  editing: boolean;
  visibilityDisabledReason: string | null;
  onCreate: () => void;
  onToggleEditing: () => void;
}) {
  const presentation = getSavedViewsEditingPresentation(editing);
  const EditingIcon = presentation.icon;
  return (
    <header className="setta-workspace-saved-views-heading">
      <div>
        <h2>Saved Views</h2>
        <p>{presentation.description}</p>
      </div>
      <div className="setta-workspace-saved-views-heading-actions">
        <button
          aria-label={presentation.label}
          aria-pressed={editing}
          className="setta-workspace-saved-views-edit"
          disabled={visibilityDisabledReason !== null}
          title={visibilityDisabledReason ?? presentation.label}
          type="button"
          onClick={
            visibilityDisabledReason === null ? onToggleEditing : undefined
          }
        >
          <EditingIcon aria-hidden="true" />
          {presentation.buttonText}
        </button>
        <button
          aria-label="Create view"
          className="setta-workspace-saved-views-create"
          disabled={createDisabledReason !== null}
          ref={createRef}
          title={createDisabledReason ?? "Create a saved view"}
          type="button"
          onClick={createDisabledReason === null ? onCreate : undefined}
        >
          <FiPlus aria-hidden="true" />
          New view
        </button>
      </div>
    </header>
  );
}

function getSavedViewsEditingPresentation(editing: boolean) {
  if (editing) {
    return {
      buttonText: "Done",
      description: "Choose what belongs in the active view on the canvas.",
      icon: FiCheck,
      label: "Finish editing saved view",
    };
  }
  return {
    buttonText: "Edit",
    description: "Switch canvas presentations.",
    icon: FiEdit3,
    label: "Edit saved view",
  };
}

export function WorkspaceSavedViewsEditNotice({
  disabledReason,
}: {
  disabledReason: string | null;
}) {
  return disabledReason === null ? null : (
    <p className="setta-workspace-saved-views-disabled" role="status">
      {disabledReason} You can still switch views.
    </p>
  );
}
