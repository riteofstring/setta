import { useMemo, useState } from "react";
import { FiSave } from "react-icons/fi";
import type {
  WorkspaceWindowSpaceErrors,
  WorkspaceWindowSpacesPaneProps,
} from "./WorkspaceWindowSpacesPane.js";
import { WorkspaceWindowSpaceRow } from "./WorkspaceWindowSpacesPaneParts.js";
import {
  canSnapshotWorkspaceWindowSpace,
  restoreWorkspaceWindowSpace,
  type WorkspaceWindowSpace,
} from "./windowSpaces.js";
import { WorkspaceWindowingError } from "./windowingTypes.js";

function joinClassNames(
  ...classNames: ReadonlyArray<string | false | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

function reorderSpaceIds(
  currentIds: readonly string[],
  draggedId: string,
  targetId: string,
): readonly string[] | null {
  if (
    new Set(currentIds).size !== currentIds.length ||
    draggedId === targetId
  ) {
    return null;
  }
  const draggedIndex = currentIds.indexOf(draggedId);
  const targetIndex = currentIds.indexOf(targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return null;
  }
  const nextIds = [...currentIds];
  nextIds.splice(draggedIndex, 1);
  nextIds.splice(targetIndex, 0, draggedId);
  return nextIds;
}

function WorkspaceWindowSpacesPaneHeader({
  canSave,
  onSave,
  pending,
}: {
  canSave: boolean;
  onSave: (() => void) | undefined;
  pending: boolean | undefined;
}) {
  return (
    <div className="setta-workspace-window-spaces-pane-heading">
      <div>
        <h2>Window Spaces</h2>
        <p>
          Open one or more floating windows, then save them as a reusable layout
          you can restore here or open in a dedicated tab.
        </p>
      </div>
      <button
        className="setta-workspace-window-spaces-pane-save"
        data-testid="workspace-window-space-save"
        disabled={!canSave || !onSave || pending}
        title={
          canSave
            ? "Save the current floating windows as a window space"
            : "Open a floating window first to save a window space"
        }
        type="button"
        onClick={canSave && onSave && !pending ? onSave : undefined}
      >
        <FiSave aria-hidden="true" size={14} />
        Save Window Space
      </button>
    </div>
  );
}

function WorkspaceWindowSpacesPaneMessages({
  errors,
}: {
  errors: readonly (string | null | undefined)[];
}) {
  return (
    <>
      {errors.map((error, index) =>
        error ? (
          <p
            key={index}
            className="setta-workspace-window-spaces-pane-error"
            role="alert"
          >
            {error}
          </p>
        ) : null,
      )}
    </>
  );
}

function WorkspaceWindowSpacesPaneRows({
  canReorder,
  draggedSpaceId,
  editing,
  layoutEditable,
  onDelete,
  onDragEnd,
  onDragStart,
  onOpenDedicated,
  onRename,
  onReorder,
  onRestore,
  pending,
  spaces,
  spaceErrors,
}: {
  canReorder: boolean;
  draggedSpaceId: string | null;
  editing: boolean;
  layoutEditable: boolean;
  onDelete: WorkspaceWindowSpacesPaneProps["onDelete"];
  onDragEnd: () => void;
  onDragStart: (spaceId: string) => void;
  onOpenDedicated: WorkspaceWindowSpacesPaneProps["onOpenDedicated"];
  onRename: WorkspaceWindowSpacesPaneProps["onRename"];
  onReorder: (draggedId: string, targetId: string) => void;
  onRestore: (space: WorkspaceWindowSpace) => void;
  pending: WorkspaceWindowSpacesPaneProps["pending"];
  spaces: readonly WorkspaceWindowSpace[];
  spaceErrors: WorkspaceWindowSpaceErrors["bySpaceId"];
}) {
  if (spaces.length === 0) {
    return (
      <div className="setta-workspace-window-spaces-pane-empty" role="status">
        No window spaces yet. Open a section or chat as a floating window, then
        save it here to reopen that layout later by URL.
      </div>
    );
  }
  return (
    <div className="setta-workspace-window-spaces-pane-list" role="list">
      {spaces.map((space) => (
        <WorkspaceWindowSpaceRow
          key={space.id}
          canMutate={layoutEditable}
          canReorder={canReorder}
          draggedSpaceId={draggedSpaceId}
          editing={editing}
          pending={pending}
          space={space}
          spaceError={spaceErrors?.[space.id]}
          onDelete={onDelete}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onOpenDedicated={onOpenDedicated}
          onRename={onRename}
          onReorder={onReorder}
          onRestore={onRestore}
        />
      ))}
    </div>
  );
}

function useWorkspaceWindowSpacesPaneController({
  editing,
  layoutEditable,
  onReorder,
  onRestore,
  onStateChange,
  pending,
  spaces,
  state,
  viewport,
}: Pick<
  WorkspaceWindowSpacesPaneProps,
  | "editing"
  | "layoutEditable"
  | "onReorder"
  | "onRestore"
  | "onStateChange"
  | "pending"
  | "spaces"
  | "state"
  | "viewport"
>) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [draggedSpaceId, setDraggedSpaceId] = useState<string | null>(null);
  const orderedSpaces = useMemo(
    () =>
      [...spaces].sort(
        (first, second) =>
          first.order - second.order || first.id.localeCompare(second.id),
      ),
    [spaces],
  );
  const canSave = Boolean(
    layoutEditable && canSnapshotWorkspaceWindowSpace(state),
  );
  const canReorder = Boolean(
    editing && layoutEditable && orderedSpaces.length > 1 && !pending?.reorder,
  );
  const restore = (space: WorkspaceWindowSpace) => {
    if (!layoutEditable || pending?.restoreSpaceIds?.includes(space.id)) {
      return;
    }
    try {
      const result = restoreWorkspaceWindowSpace(state, space, viewport, {
        layoutEditable,
      });
      setLocalError(null);
      onStateChange(result.state);
      onRestore?.(space, result);
    } catch (error) {
      if (error instanceof WorkspaceWindowingError) {
        setLocalError(error.message);
        return;
      }
      throw error;
    }
  };
  const reorder = (draggedId: string, targetId: string) => {
    if (!canReorder || !onReorder) {
      return;
    }
    const nextIds = reorderSpaceIds(
      orderedSpaces.map((space) => space.id),
      draggedId,
      targetId,
    );
    if (nextIds) {
      onReorder(nextIds);
    }
  };
  return {
    canReorder,
    canSave,
    draggedSpaceId,
    localError,
    orderedSpaces,
    reorder,
    restore,
    setDraggedSpaceId,
  };
}

export function WorkspaceWindowSpacesPaneContent({
  ariaLabel = "Window Spaces",
  className,
  editing = false,
  errors,
  layoutEditable = true,
  onDelete,
  onOpenDedicated,
  onRename,
  onReorder,
  onRestore,
  onSave,
  onStateChange,
  pending,
  spaces,
  state,
  viewport,
}: WorkspaceWindowSpacesPaneProps) {
  const controller = useWorkspaceWindowSpacesPaneController({
    editing,
    layoutEditable,
    onReorder,
    onRestore,
    onStateChange,
    pending,
    spaces,
    state,
    viewport,
  });
  return (
    <section
      aria-label={ariaLabel}
      className={joinClassNames(
        "setta-workspace-window-spaces-pane",
        className,
      )}
      data-testid="workspace-window-spaces-pane"
    >
      <WorkspaceWindowSpacesPaneHeader
        canSave={controller.canSave}
        onSave={onSave}
        pending={pending?.save}
      />
      <WorkspaceWindowSpacesPaneMessages
        errors={[errors?.save, errors?.reorder, controller.localError]}
      />
      <WorkspaceWindowSpacesPaneRows
        canReorder={controller.canReorder}
        draggedSpaceId={controller.draggedSpaceId}
        editing={editing}
        layoutEditable={layoutEditable}
        pending={pending}
        spaceErrors={errors?.bySpaceId}
        spaces={controller.orderedSpaces}
        onDelete={onDelete}
        onDragEnd={() => controller.setDraggedSpaceId(null)}
        onDragStart={controller.setDraggedSpaceId}
        onOpenDedicated={onOpenDedicated}
        onRename={onRename}
        onReorder={controller.reorder}
        onRestore={controller.restore}
      />
    </section>
  );
}
