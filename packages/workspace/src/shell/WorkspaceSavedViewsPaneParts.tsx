import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { FiBookmark, FiCheck, FiEdit3, FiPlus, FiTrash2 } from "react-icons/fi";
import { RxDragHandleDots2 } from "react-icons/rx";
import type { WorkspaceSavedView } from "../document/types";

export type WorkspaceSavedViewDisabledReasons = {
  activate: string | null;
  create: string | null;
  delete: string | null;
  rename: string | null;
  reorder: string | null;
  tab: string | null;
  visibility: string | null;
};

type WorkspaceSavedViewActions = {
  activate: (view: WorkspaceSavedView) => void;
  deleteView: (view: WorkspaceSavedView) => void;
  move: (view: WorkspaceSavedView, direction: -1 | 1) => void;
  renameView: (view: WorkspaceSavedView, draft: string) => string | null;
  reorderView: (view: WorkspaceSavedView, target: WorkspaceSavedView) => void;
  setTabVisibility: (view: WorkspaceSavedView, visible: boolean) => void;
  validateName: (view: WorkspaceSavedView, draft: string) => string | null;
};

function getControlState(
  disabledReason: string | null,
  enabledTitle: string,
): { disabled: boolean; title: string } {
  return disabledReason === null
    ? { disabled: false, title: enabledTitle }
    : { disabled: true, title: disabledReason };
}

function useWorkspaceSavedViewNameEditor({
  control,
  view,
  onRename,
  registerInput,
  validateName,
}: {
  control: { disabled: boolean; title: string };
  view: WorkspaceSavedView;
  onRename: (draft: string) => string | null;
  registerInput: (element: HTMLInputElement | null) => void;
  validateName: (draft: string) => string | null;
}) {
  const [draft, setDraft] = useState(view.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    setDraft(view.name);
    setNameError(null);
  }, [view.id, view.name]);

  function submit(): void {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      return;
    }
    const nextName = draft.trim();
    if (validateName(draft) !== null || nextName === view.name) {
      setDraft(view.name);
      setNameError(null);
      return;
    }
    const operationError = onRename(draft);
    if (operationError !== null) {
      setDraft(view.name);
      setNameError(operationError);
      return;
    }
    setDraft(nextName);
    setNameError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelBlurRef.current = true;
      setDraft(view.name);
      setNameError(null);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return {
    editor: (
      <input
        aria-invalid={nameError ? true : undefined}
        aria-label={`Rename ${view.name}`}
        className="setta-workspace-saved-views-name-input"
        disabled={control.disabled}
        ref={registerInput}
        title={control.title}
        value={draft}
        onBlur={submit}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          setNameError(validateName(nextDraft));
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      />
    ),
    nameError,
  };
}

function WorkspaceSavedViewActionButton({
  children,
  control,
  label,
  onClick,
  pressed,
  tone,
}: {
  children: ReactNode;
  control: { disabled: boolean; title: string };
  label: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="setta-workspace-saved-views-icon-button"
      data-tone={tone}
      disabled={control.disabled}
      title={control.title}
      type="button"
      onClick={
        control.disabled
          ? undefined
          : (event) => {
              event.stopPropagation();
              onClick();
            }
      }
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  );
}

function WorkspaceSavedViewEditingRow({
  actions,
  activeViewId,
  canReorder,
  disabledReasons,
  dragged,
  dropTarget,
  lastViewDeleteReason,
  registerViewButton,
  showTabBookmarks,
  view,
  viewCount,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
}: WorkspaceSavedViewsListProps & {
  canReorder: boolean;
  dragged: boolean;
  dropTarget: boolean;
  view: WorkspaceSavedView;
  viewCount: number;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const active = view.id === activeViewId;
  const activateControl = getControlState(
    disabledReasons.activate,
    `Activate ${view.name}`,
  );
  const renameControl = getControlState(
    disabledReasons.rename,
    `Rename ${view.name}`,
  );
  const deleteControl = getControlState(
    disabledReasons.delete ?? lastViewDeleteReason,
    `Delete ${view.name}`,
  );
  const tabControl = getControlState(
    disabledReasons.tab,
    view.isTab ? "Shown as a tab" : "Not shown as a tab",
  );
  const nameEditor = useWorkspaceSavedViewNameEditor({
    control: renameControl,
    view,
    onRename: (draft) => actions.renameView(view, draft),
    registerInput: (element) => registerViewButton(view.id, element),
    validateName: (draft) => actions.validateName(view, draft),
  });

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    actions.move(view, event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <div className="setta-workspace-saved-views-row-wrap">
      <div
        className="setta-workspace-saved-views-row"
        data-active={String(active)}
        data-dragging={String(dragged)}
        data-drop-target={String(dropTarget)}
        data-invalid={String(nameEditor.nameError !== null)}
        data-workspace-saved-view-id={view.id}
        role="listitem"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {viewCount > 1 ? (
          <button
            aria-label={`Reorder ${view.name}`}
            className="setta-workspace-saved-views-drag-handle"
            data-testid="workspace-saved-view-drag-handle"
            disabled={!canReorder}
            draggable={canReorder}
            title={`Reorder ${view.name}. Use Up and Down Arrow keys or drag.`}
            type="button"
            onClick={(event) => event.stopPropagation()}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onKeyDown={onHandleKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <RxDragHandleDots2 aria-hidden="true" />
          </button>
        ) : null}
        <button
          aria-label={`Activate ${view.name}`}
          aria-pressed={active}
          className="setta-workspace-saved-views-row-activate"
          disabled={activateControl.disabled}
          title={activateControl.title}
          type="button"
          onClick={
            activateControl.disabled ? undefined : () => actions.activate(view)
          }
        />
        {nameEditor.editor}
        {showTabBookmarks ? (
          <WorkspaceSavedViewActionButton
            control={tabControl}
            label={
              view.isTab
                ? `Hide ${view.name} from tabs`
                : `Show ${view.name} as a tab`
            }
            pressed={view.isTab}
            onClick={() => actions.setTabVisibility(view, !view.isTab)}
          >
            <FiBookmark aria-hidden="true" />
          </WorkspaceSavedViewActionButton>
        ) : null}
        <WorkspaceSavedViewActionButton
          control={deleteControl}
          label={`Delete ${view.name}`}
          tone="danger"
          onClick={() => actions.deleteView(view)}
        >
          <FiTrash2 aria-hidden="true" />
        </WorkspaceSavedViewActionButton>
      </div>
      {nameEditor.nameError ? (
        <p className="setta-workspace-saved-views-error" role="alert">
          {nameEditor.nameError}
        </p>
      ) : null}
    </div>
  );
}

function WorkspaceSavedViewPresentationRow({
  actions,
  activeViewId,
  disabledReasons,
  registerViewButton,
  view,
}: WorkspaceSavedViewsListProps & { view: WorkspaceSavedView }) {
  const active = view.id === activeViewId;
  const activateControl = getControlState(
    disabledReasons.activate,
    `Activate ${view.name}`,
  );
  return (
    <div
      className="setta-workspace-saved-views-row"
      data-active={String(active)}
      data-workspace-saved-view-id={view.id}
      role="listitem"
    >
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
        <span>{view.name}</span>
      </button>
    </div>
  );
}

type WorkspaceSavedViewsListProps = {
  actions: WorkspaceSavedViewActions;
  activeViewId: string;
  disabledReasons: WorkspaceSavedViewDisabledReasons;
  editing: boolean;
  lastViewDeleteReason: string | null;
  registerViewButton: (
    viewId: string,
    element: HTMLButtonElement | HTMLInputElement | null,
  ) => void;
  showTabBookmarks: boolean;
  views: ReadonlyArray<WorkspaceSavedView>;
};

export function WorkspaceSavedViewsList(props: WorkspaceSavedViewsListProps) {
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
  const [dropTargetViewId, setDropTargetViewId] = useState<string | null>(null);
  const canReorder =
    props.editing &&
    props.disabledReasons.reorder === null &&
    props.views.length > 1;

  function finishDrag(): void {
    setDraggedViewId(null);
    setDropTargetViewId(null);
  }

  function startDrag(
    event: DragEvent<HTMLButtonElement>,
    view: WorkspaceSavedView,
  ): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", view.id);
    }
    setDraggedViewId(view.id);
  }

  function dragOver(
    event: DragEvent<HTMLDivElement>,
    view: WorkspaceSavedView,
  ): void {
    if (!canReorder || draggedViewId === view.id) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    setDropTargetViewId(view.id);
  }

  function drop(
    event: DragEvent<HTMLDivElement>,
    target: WorkspaceSavedView,
  ): void {
    event.preventDefault();
    const sourceId =
      draggedViewId || event.dataTransfer?.getData("text/plain") || null;
    const source = props.views.find((view) => view.id === sourceId);
    if (canReorder && source && source.id !== target.id) {
      props.actions.reorderView(source, target);
    }
    finishDrag();
  }

  return (
    <div className="setta-workspace-saved-views-list" role="list">
      {props.views.map((view) =>
        props.editing ? (
          <WorkspaceSavedViewEditingRow
            {...props}
            canReorder={canReorder}
            dragged={draggedViewId === view.id}
            dropTarget={dropTargetViewId === view.id}
            key={view.id}
            view={view}
            viewCount={props.views.length}
            onDragEnd={finishDrag}
            onDragOver={(event) => dragOver(event, view)}
            onDragStart={(event) => startDrag(event, view)}
            onDrop={(event) => drop(event, view)}
          />
        ) : (
          <WorkspaceSavedViewPresentationRow
            {...props}
            key={view.id}
            view={view}
          />
        ),
      )}
    </div>
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
      <h2>Saved Views</h2>
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
          New View
        </button>
      </div>
    </header>
  );
}

function getSavedViewsEditingPresentation(editing: boolean) {
  if (editing) {
    return {
      buttonText: "Done",
      icon: FiCheck,
      label: "Finish editing saved view",
    };
  }
  return {
    buttonText: "Edit",
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
