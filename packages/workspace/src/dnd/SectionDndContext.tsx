import _ from "lodash";
import { useEffect, useMemo, type ReactNode } from "react";
import { getWorkspaceDocumentStore } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import { DragDropProvider } from "./adapter";
import { createCollisionTracker } from "./adapter/collision";
import { DeferredDndDeactivation } from "./DeferredDndDeactivation";
import {
  getDisplayedSectionIdToChildren,
  getDndChildrenStore,
  updateDndChildren,
} from "./dndChildren";
import { useDndMode } from "./dndState";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { DummyDragOverlay } from "./DummySection";
import { useSectionDndSensors } from "./useDNDSensors";
import { onDragStart, useOnDragMove, useOnDragOver } from "./useDropType";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

function useDndChildrenDocumentSync() {
  const host = useWorkspaceHost();
  useEffect(() => {
    let lastChildren = getDisplayedSectionIdToChildren(
      getWorkspaceDocumentStore(host).getState(),
    );
    updateDndChildren(host, lastChildren);
    return getWorkspaceDocumentStore(host).subscribe((state) => {
      const nextChildren = getDisplayedSectionIdToChildren(state);
      if (_.isEqual(nextChildren, lastChildren)) {
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
