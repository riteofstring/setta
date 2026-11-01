import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { FiEdit3, FiTrash2 } from "react-icons/fi";
import { MdFlipToFront, MdOpenInNew } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import type { WorkspaceWindowSpacePending } from "./WorkspaceWindowSpacesPane.js";
import type { WorkspaceWindowSpace } from "./windowSpaces.js";

function includesId(ids: readonly string[] | undefined, id: string): boolean {
  return ids?.includes(id) ?? false;
}

function useWindowSpaceNameDraft({
  editingRow,
  name,
  onRename,
  spaceId,
}: {
  editingRow: boolean;
  name: string;
  onRename?: (nextName: string) => void;
  spaceId: string;
}) {
  const [draft, setDraft] = useState(name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submittedDraftRef = useRef<string | null>(null);
  const isEditing = editingRow || isRenaming;

  useEffect(() => {
    setDraft(name);
    setIsRenaming(false);
    setValidationError(null);
    submittedDraftRef.current = null;
  }, [name, spaceId]);
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
  }, [isEditing]);

  const submit = () => {
    const nextName = draft.trim();
    if (nextName === "") {
      setValidationError("A window space name is required.");
      return;
    }
    if (submittedDraftRef.current === nextName) {
      return;
    }
    submittedDraftRef.current = nextName;
    setDraft(nextName);
    setValidationError(null);
    if (!editingRow) {
      setIsRenaming(false);
    }
    if (nextName !== name) {
      onRename?.(nextName);
    }
  };
  const cancel = () => {
    setDraft(name);
    setValidationError(null);
    submittedDraftRef.current = null;
    setIsRenaming(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.code === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.code === "Enter") {
      event.preventDefault();
      submit();
    }
  };
  const onChange = (nextDraft: string) => {
    submittedDraftRef.current = null;
    setDraft(nextDraft);
    setValidationError(
      nextDraft.trim() === "" ? "A window space name is required." : null,
    );
  };

  return {
    draft,
    inputRef,
    isEditing,
    onChange,
    onKeyDown,
    setIsRenaming,
    submit,
    validationError,
  };
}

function WorkspaceWindowSpaceNameEditor({
  canRename,
  draft,
  inputRef,
  isPending,
  onChange,
  onKeyDown,
  onSubmit,
  validationError,
}: {
  canRename: boolean;
  draft: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isPending: boolean;
  onChange: (nextDraft: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  validationError: string | null;
}) {
  return (
    <div className="setta-workspace-window-spaces-pane-name-editor">
      <input
        ref={inputRef}
        aria-invalid={validationError ? true : undefined}
        aria-label="Window space name"
        className="setta-workspace-window-spaces-pane-name-input"
        data-testid="workspace-window-space-name-input"
        disabled={!canRename || isPending}
        value={draft}
        onBlur={onSubmit}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {validationError ? (
        <span className="setta-workspace-window-spaces-pane-error" role="alert">
          {validationError}
        </span>
      ) : null}
    </div>
  );
}

function WorkspaceWindowSpaceName({
  canRename,
  canRestore,
  editingRow,
  isPending,
  name,
  onRename,
  onRestore,
  spaceId,
}: {
  canRename: boolean;
  canRestore: boolean;
  editingRow: boolean;
  isPending: boolean;
  name: string;
  onRename?: (nextName: string) => void;
  onRestore: () => void;
  spaceId: string;
}) {
  const draft = useWindowSpaceNameDraft({
    editingRow,
    name,
    onRename,
    spaceId,
  });
  if (draft.isEditing) {
    return (
      <WorkspaceWindowSpaceNameEditor
        canRename={canRename}
        isPending={isPending}
        {...draft}
        onSubmit={draft.submit}
      />
    );
  }
  return (
    <>
      <button
        className="setta-workspace-window-spaces-pane-name setta-workspace-window-spaces-pane-name-restore"
        data-testid="workspace-window-space-restore"
        disabled={!canRestore || isPending}
        type="button"
        onClick={canRestore && !isPending ? onRestore : undefined}
      >
        {name}
      </button>
      <WorkspaceWindowSpaceRenameButton
        canRename={canRename}
        isPending={isPending}
        name={name}
        onRenameAvailable={onRename !== undefined}
        onStart={() => draft.setIsRenaming(true)}
      />
    </>
  );
}

function WorkspaceWindowSpaceRenameButton({
  canRename,
  isPending,
  name,
  onRenameAvailable,
  onStart,
}: {
  canRename: boolean;
  isPending: boolean;
  name: string;
  onRenameAvailable: boolean;
  onStart: () => void;
}) {
  if (!canRename) {
    return null;
  }
  return (
    <button
      aria-label={`Rename ${name}`}
      className="setta-workspace-window-spaces-pane-icon-button"
      data-testid="workspace-window-space-rename"
      disabled={isPending || !onRenameAvailable}
      title={`Rename ${name}`}
      type="button"
      onClick={!isPending && onRenameAvailable ? onStart : undefined}
    >
      <FiEdit3 aria-hidden="true" size={14} />
    </button>
  );
}

function getDraggedSpaceId(
  event: DragEvent<HTMLElement>,
  draggedSpaceId: string | null,
): string | null {
  return draggedSpaceId ?? event.dataTransfer?.getData("text/plain") ?? null;
}

function WorkspaceWindowSpaceDragHandle({
  enabled,
  onDragEnd,
  onDragStart,
  space,
}: {
  enabled: boolean;
  onDragEnd: () => void;
  onDragStart: (spaceId: string) => void;
  space: WorkspaceWindowSpace;
}) {
  if (!enabled) {
    return null;
  }
  return (
    <button
      aria-label={`Reorder ${space.name}`}
      className="setta-workspace-window-spaces-pane-drag-handle"
      data-testid="workspace-window-space-drag-handle"
      draggable
      type="button"
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", space.id);
        onDragStart(space.id);
      }}
    >
      <RxDragHandleDots2 aria-hidden="true" size={14} />
    </button>
  );
}

function WorkspaceWindowSpaceEditRestoreButton({
  canRestore,
  show,
  space,
  onRestore,
}: {
  canRestore: boolean;
  show: boolean;
  space: WorkspaceWindowSpace;
  onRestore: (space: WorkspaceWindowSpace) => void;
}) {
  if (!show) {
    return null;
  }
  return (
    <button
      aria-label={`Restore ${space.name}`}
      className="setta-workspace-window-spaces-pane-icon-button"
      data-testid="workspace-window-space-edit-restore"
      disabled={!canRestore}
      title={`Restore ${space.name}`}
      type="button"
      onClick={canRestore ? () => onRestore(space) : undefined}
    >
      <MdFlipToFront aria-hidden="true" size={14} />
    </button>
  );
}

function WorkspaceWindowSpaceDedicatedButton({
  isBusy,
  onOpenDedicated,
  space,
}: {
  isBusy: boolean;
  onOpenDedicated?: (space: WorkspaceWindowSpace) => void;
  space: WorkspaceWindowSpace;
}) {
  const enabled = !isBusy && onOpenDedicated !== undefined;
  return (
    <button
      aria-label={`Open ${space.name} in a new tab`}
      className="setta-workspace-window-spaces-pane-icon-button"
      data-testid="workspace-window-space-open-dedicated"
      disabled={!enabled}
      title={`Open ${space.name} in a new tab`}
      type="button"
      onClick={enabled ? () => onOpenDedicated(space) : undefined}
    >
      <MdOpenInNew aria-hidden="true" size={14} />
    </button>
  );
}

function WorkspaceWindowSpaceDeleteButton({
  canDelete,
  onDelete,
  show,
  space,
}: {
  canDelete: boolean;
  onDelete?: (spaceId: string) => void;
  show: boolean;
  space: WorkspaceWindowSpace;
}) {
  if (!show) {
    return null;
  }
  const enabled = canDelete && onDelete !== undefined;
  return (
    <button
      aria-label={`Delete ${space.name}`}
      className="setta-workspace-window-spaces-pane-icon-button setta-workspace-window-spaces-pane-delete"
      data-testid="workspace-window-space-delete"
      disabled={!enabled}
      title={`Delete ${space.name}`}
      type="button"
      onClick={enabled ? () => onDelete(space.id) : undefined}
    >
      <FiTrash2 aria-hidden="true" size={14} />
    </button>
  );
}

function canUseRowAction(
  canMutate: boolean,
  blocked: readonly boolean[],
): boolean {
  return canMutate && blocked.every((value) => !value);
}

function getRowState(
  pending: WorkspaceWindowSpacePending | undefined,
  spaceId: string,
  canMutate: boolean,
) {
  const isRestoring = includesId(pending?.restoreSpaceIds, spaceId);
  const isRenaming = includesId(pending?.renameSpaceIds, spaceId);
  const isDeleting = includesId(pending?.deleteSpaceIds, spaceId);
  const isBusy = [isRestoring, isRenaming, isDeleting].some(Boolean);
  return {
    canDelete: canUseRowAction(canMutate, [isRestoring, isRenaming]),
    canRename: canUseRowAction(canMutate, [isRestoring, isDeleting]),
    canRestore: canUseRowAction(canMutate, [isBusy]),
    isBusy,
    isRenaming,
  };
}

export function WorkspaceWindowSpaceRow({
  canMutate,
  canReorder,
  draggedSpaceId,
  editing,
  onDelete,
  onDragEnd,
  onDragStart,
  onOpenDedicated,
  onRename,
  onReorder,
  onRestore,
  pending,
  space,
  spaceError,
}: {
  canMutate: boolean;
  canReorder: boolean;
  draggedSpaceId: string | null;
  editing: boolean;
  onDelete?: (spaceId: string) => void;
  onDragEnd: () => void;
  onDragStart: (spaceId: string) => void;
  onOpenDedicated?: (space: WorkspaceWindowSpace) => void;
  onRename?: (spaceId: string, nextName: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onRestore: (space: WorkspaceWindowSpace) => void;
  pending: WorkspaceWindowSpacePending | undefined;
  space: WorkspaceWindowSpace;
  spaceError: string | null | undefined;
}) {
  const row = getRowState(pending, space.id, canMutate);
  const editingRow = editing && canMutate;
  return (
    <div className="setta-workspace-window-spaces-pane-row-wrap">
      <div
        className="setta-workspace-window-spaces-pane-row"
        data-testid="workspace-window-space-row"
        data-workspace-window-space-id={space.id}
        role="listitem"
        onDragOver={canReorder ? (event) => event.preventDefault() : undefined}
        onDrop={
          canReorder
            ? (event) => {
                const sourceId = getDraggedSpaceId(event, draggedSpaceId);
                if (sourceId) {
                  onReorder(sourceId, space.id);
                }
                onDragEnd();
              }
            : undefined
        }
      >
        <WorkspaceWindowSpaceDragHandle
          enabled={editing && canReorder}
          space={space}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
        />
        <WorkspaceWindowSpaceName
          canRename={row.canRename && onRename !== undefined}
          canRestore={row.canRestore}
          editingRow={editingRow}
          isPending={row.isRenaming}
          name={space.name}
          spaceId={space.id}
          onRename={
            onRename ? (nextName) => onRename(space.id, nextName) : undefined
          }
          onRestore={() => onRestore(space)}
        />
        <WorkspaceWindowSpaceEditRestoreButton
          canRestore={row.canRestore}
          show={editingRow}
          space={space}
          onRestore={onRestore}
        />
        <WorkspaceWindowSpaceDedicatedButton
          isBusy={row.isBusy}
          onOpenDedicated={onOpenDedicated}
          space={space}
        />
        <WorkspaceWindowSpaceDeleteButton
          canDelete={row.canDelete}
          onDelete={onDelete}
          show={canMutate}
          space={space}
        />
      </div>
      {spaceError ? (
        <p className="setta-workspace-window-spaces-pane-error" role="alert">
          {spaceError}
        </p>
      ) : null}
    </div>
  );
}
