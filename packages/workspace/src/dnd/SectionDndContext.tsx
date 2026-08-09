import _ from "lodash";
import { useEffect, useMemo, type ReactNode } from "react";
import { useWorkspaceDocument } from "../document/stores";
import { DragDropProvider } from "./adapter";
import { createCollisionTracker } from "./adapter/collision";
import { DeferredDndDeactivation } from "./DeferredDndDeactivation";
import { getDisplayedSectionIdToChildren, updateDndChildren, useDndChildren } from "./dndChildren";
import { useDndMode } from "./dndState";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { DummyDragOverlay } from "./DummySection";
import { useSectionDndSensors } from "./useDNDSensors";
import { onDragStart, useOnDragMove, useOnDragOver } from "./useDropType";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

// The reference keeps the dnd children projection in sync through an app-level store
// subscription (`state/subscriptions.ts`); the package owns the same lifecycle here, scoped to
// the mounted dnd context.
function useDndChildrenDocumentSync() {
  useEffect(() => {
    let lastChildren = getDisplayedSectionIdToChildren(useWorkspaceDocument.getState());
    updateDndChildren(lastChildren);
    return useWorkspaceDocument.subscribe((state) => {
      const nextChildren = getDisplayedSectionIdToChildren(state);
      if (_.isEqual(nextChildren, lastChildren)) {
        return;
      }
      lastChildren = nextChildren;
      updateDndChildren(nextChildren);
    });
  }, []);
}

export function SectionDndContext({ children }: { children: ReactNode }) {
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
        mode: "section",
        getParentByChild: () => useDndChildren.getState().y,
      }),
    [],
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
      onDragStart={onDragStart}
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
