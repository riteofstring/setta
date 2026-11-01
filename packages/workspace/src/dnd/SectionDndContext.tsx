import { useEffect, useMemo, type ReactNode } from "react";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores.js";
import { isWorkspaceSavedViewEditing } from "../saved-views/editingState.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import { DragDropProvider } from "./adapter/index.js";
import { createCollisionTracker } from "./adapter/collision.js";
import { DeferredDndDeactivation } from "./DeferredDndDeactivation.js";
import {
  getDisplayedSectionIdToChildren,
  getDndChildrenStore,
  updateDndChildren,
} from "./dndChildren.js";
import { useDndMode } from "./dndState.js";
import { DragOperationShapeSync } from "./DragOperationShapeSync.js";
import { DummyDragOverlay } from "./DummySection.js";
import { useSectionDndSensors } from "./useDNDSensors.js";
import { onDragStart, useOnDragMove, useOnDragOver } from "./useDropType.js";
import { useModifiers } from "./useModifiers.js";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection.js";
import { deepEqual } from "../state/deepEqual.js";

function useDndChildrenDocumentSync() {
  const host = useWorkspaceHost();
  useEffect(() => {
    const projectChildren = (state: WorkspaceDocumentState) =>
      getDisplayedSectionIdToChildren(
        state,
        state.savedViews !== null && isWorkspaceSavedViewEditing(host),
      );
    let lastChildren = projectChildren(
      getWorkspaceDocumentStore(host).getState(),
    );
    updateDndChildren(host, lastChildren);
    return getWorkspaceDocumentStore(host).subscribe((state) => {
      const nextChildren = projectChildren(state);
      if (deepEqual(nextChildren, lastChildren)) {
        return;
      }
      lastChildren = nextChildren;
      updateDndChildren(host, nextChildren);
    });
  }, [host]);
}

export function SectionDndContext({ children }: { children: ReactNode }) {
  const host = useWorkspaceHost();
  const { dummyRef, onDragEnd } = useOnDragEndMoveSection();
  const onDragMove = useOnDragMove();
  const onDragOver = useOnDragOver();
  const { modifiers } = useModifiers();
  const sensors = useSectionDndSensors();
  const { isMovingFree, isSorting } = useDndMode();
  useDndChildrenDocumentSync();
  const collisionTracker = useMemo(
    () =>
      createCollisionTracker({
        host,
        mode: "section",
        getParentByChild: () => getDndChildrenStore(host).getState().y,
      }),
    [host],
  );
  const dndContext = useMemo(
    () => ({
      isMovingFree,
      isSorting,
    }),
    [isMovingFree, isSorting],
  );

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={(event) => onDragStart(host, event)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragEnd}
      onDragOver={onDragOver}
      modifiers={modifiers ?? undefined}
      dndContext={dndContext}
      collisionTracker={collisionTracker}
    >
      <DragOperationShapeSync />
      <DeferredDndDeactivation />
      {children}
      {isMovingFree ? <DummyDragOverlay ref={dummyRef} /> : null}
    </DragDropProvider>
  );
}
