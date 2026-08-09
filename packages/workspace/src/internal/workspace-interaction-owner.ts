import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  IDLE_INTERACTION_OWNERSHIP,
  resolveInteractionActivationPolicy,
  transitionInteractionOwnership,
  type InteractionInput,
  type InteractionOwner,
  type InteractionOwnershipState,
} from "./interaction-owner.js";
import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";
import { WorkspaceInteractionActivationStore } from "./workspace-interaction-activation.js";

export type WorkspaceStructuralInteractionStart = Readonly<{
  input: InteractionInput;
  localLayout: boolean;
  mode: WorkspaceSectionMoveMode;
  root: boolean;
  sectionId: string;
  title: string;
}>;

type WorkspaceStructuralInteractionSession = Readonly<
  Pick<WorkspaceStructuralInteractionStart, "input" | "mode" | "sectionId" | "title">
>;

type WorkspaceInteractionCoordinatorState = Readonly<{
  itemTreeId: string | null;
  ownership: InteractionOwnershipState;
  structuralSession: WorkspaceStructuralInteractionSession | null;
}>;

const IDLE_COORDINATOR_STATE: WorkspaceInteractionCoordinatorState = {
  itemTreeId: null,
  ownership: IDLE_INTERACTION_OWNERSHIP,
  structuralSession: null,
};

function structuralStartAnnouncement(start: WorkspaceStructuralInteractionStart): string {
  const mode = start.localLayout
    ? "freeform positioning"
    : start.mode === "sort"
      ? "sorting"
      : "free-move";
  if (start.input === "keyboard") {
    return `${start.title} ${mode} started. Use the arrow keys to move, Enter to finish, or Escape to cancel.`;
  }
  return `${start.title} ${mode} movement started.`;
}

function structuralEndAnnouncement(
  session: WorkspaceStructuralInteractionSession,
  canceled: boolean,
): string {
  return canceled
    ? `${session.title} movement canceled.`
    : `${session.title} movement finished without changing the document.`;
}

export function useWorkspaceInteractionOwner({
  layoutEnabled,
  scheduleFrame,
  sectionMode,
  structureEnabled,
}: Readonly<{
  layoutEnabled: boolean;
  scheduleFrame?: (callback: () => void) => void;
  sectionMode: WorkspaceSectionMoveMode;
  structureEnabled: boolean;
}>) {
  const [announcementText, setAnnouncementText] = useState("");
  const [state, setState] = useState<WorkspaceInteractionCoordinatorState>(IDLE_COORDINATOR_STATE);
  const [activationStore] = useState(() => new WorkspaceInteractionActivationStore());
  const stateRef = useRef(state);
  stateRef.current = state;
  // Mirror ownership into the activation store: staged synchronously inside
  // the input dispatch for imperative gating, published to React subscribers
  // with the presentation broadcast.
  const activationSnapshot = useCallback(
    (next: WorkspaceInteractionCoordinatorState) => ({
      activeItemTreeId: next.itemTreeId,
      activeSectionId: next.structuralSession?.sectionId ?? null,
      activeSectionMode: next.structuralSession?.mode ?? null,
      owner: next.ownership.owner,
      phase: next.ownership.phase,
    }),
    [],
  );
  const publishActivation = useCallback(
    (next: WorkspaceInteractionCoordinatorState) => {
      activationStore.publish(activationSnapshot(next));
    },
    [activationSnapshot, activationStore],
  );
  const stageActivation = useCallback(
    (next: WorkspaceInteractionCoordinatorState) => {
      activationStore.stage(activationSnapshot(next));
    },
    [activationSnapshot, activationStore],
  );
  // Gating always reads stateRef and the activation store synchronously; the
  // React state below only drives presentation (canvas attributes, overlays,
  // announcements). Start broadcasts defer that presentation commit to the
  // next canvas frame so gesture activation is not billed for a broad render,
  // while finish/mode transitions first flush any pending broadcast to keep
  // the committed React state sequence identical to the ownership sequence.
  const pendingBroadcastRef = useRef<(() => void) | null>(null);
  const flushPendingBroadcast = useCallback(() => {
    const pending = pendingBroadcastRef.current;
    if (pending) {
      pendingBroadcastRef.current = null;
      pending();
    }
  }, []);
  const scheduleFrameRef = useRef(scheduleFrame);
  scheduleFrameRef.current = scheduleFrame;
  const deferBroadcast = useCallback(
    (broadcast: () => void) => {
      pendingBroadcastRef.current = broadcast;
      const schedule = scheduleFrameRef.current ?? queueMicrotask;
      schedule(flushPendingBroadcast);
    },
    [flushPendingBroadcast],
  );
  useEffect(
    () => () => {
      pendingBroadcastRef.current = null;
    },
    [],
  );

  useEffect(() => {
    flushPendingBroadcast();
    stateRef.current = {
      ...stateRef.current,
      ownership: transitionInteractionOwnership(stateRef.current.ownership, {
        sectionMode,
        type: "mode-change",
      }),
    };
    publishActivation(stateRef.current);
  }, [flushPendingBroadcast, publishActivation, sectionMode]);

  const startRootLayout = useCallback(
    (input: InteractionInput): boolean => {
      if (stateRef.current.ownership.phase === "active") {
        return false;
      }
      const ownership = transitionInteractionOwnership(stateRef.current.ownership, {
        request: {
          input,
          itemMovementEnabled: false,
          layoutEnabled,
          sectionMode,
          structureEnabled,
          surface: "root-section-handle",
          viewportOverride: false,
        },
        type: "start",
      });
      if (ownership.owner !== "root-layout") {
        return false;
      }
      const next = { itemTreeId: null, ownership, structuralSession: null };
      stateRef.current = next;
      stageActivation(next);
      deferBroadcast(() => {
        activationStore.publishStaged();
        setState(next);
      });
      return true;
    },
    [
      activationStore,
      deferBroadcast,
      layoutEnabled,
      sectionMode,
      stageActivation,
      structureEnabled,
    ],
  );

  const startSectionStructure = useCallback(
    (start: WorkspaceStructuralInteractionStart) => {
      const ownership = transitionInteractionOwnership(stateRef.current.ownership, {
        request: {
          input: start.input,
          itemMovementEnabled: false,
          layoutEnabled,
          sectionMode: start.mode,
          structureEnabled: layoutEnabled && (structureEnabled || start.localLayout),
          surface: start.root ? "root-section-handle" : "nested-section-handle",
          viewportOverride: false,
        },
        type: "start",
      });
      if (ownership.owner !== "section-structure") {
        throw new Error(`Section structure cannot own movement for ${start.sectionId}.`);
      }
      const structuralSession = {
        input: start.input,
        mode: start.mode,
        sectionId: start.sectionId,
        title: start.title,
      };
      const next = { itemTreeId: null, ownership, structuralSession };
      stateRef.current = next;
      stageActivation(next);
      deferBroadcast(() => {
        activationStore.publishStaged();
        setAnnouncementText(structuralStartAnnouncement(start));
        setState(next);
      });
    },
    [activationStore, deferBroadcast, layoutEnabled, stageActivation, structureEnabled],
  );

  const startViewport = useCallback(
    (input: InteractionInput): boolean => {
      if (stateRef.current.ownership.phase === "active") {
        return false;
      }
      const ownership = transitionInteractionOwnership(stateRef.current.ownership, {
        request: {
          input,
          itemMovementEnabled: false,
          layoutEnabled,
          sectionMode,
          structureEnabled,
          surface: "canvas",
          viewportOverride: false,
        },
        type: "start",
      });
      if (ownership.owner !== "viewport") {
        return false;
      }
      const next = { itemTreeId: null, ownership, structuralSession: null };
      stateRef.current = next;
      stageActivation(next);
      deferBroadcast(() => {
        activationStore.publishStaged();
        setState(next);
      });
      return true;
    },
    [
      activationStore,
      deferBroadcast,
      layoutEnabled,
      sectionMode,
      stageActivation,
      structureEnabled,
    ],
  );

  const finish = useCallback(
    (type: "cancel" | "complete", announcement?: string) => {
      flushPendingBroadcast();
      const current = stateRef.current;
      const next = {
        itemTreeId: null,
        ownership: transitionInteractionOwnership(current.ownership, { type }),
        structuralSession: null,
      };
      stateRef.current = next;
      publishActivation(next);
      if (current.structuralSession) {
        setAnnouncementText(
          announcement ?? structuralEndAnnouncement(current.structuralSession, type === "cancel"),
        );
      }
      setState(next);
    },
    [flushPendingBroadcast, publishActivation],
  );
  const cancel = useCallback(() => finish("cancel"), [finish]);
  const finishOwned = useCallback(
    (owner: InteractionOwner, type: "cancel" | "complete", announcement?: string) => {
      if (stateRef.current.ownership.owner === owner) {
        finish(type, announcement);
      }
    },
    [finish],
  );
  const cancelSectionStructure = useCallback(
    (announcement?: string) => finishOwned("section-structure", "cancel", announcement),
    [finishOwned],
  );
  const complete = useCallback(
    (announcement?: string) => finishOwned("section-structure", "complete", announcement),
    [finishOwned],
  );
  const completeRootLayout = useCallback(
    () => finishOwned("root-layout", "complete"),
    [finishOwned],
  );
  const completeViewport = useCallback(() => finishOwned("viewport", "complete"), [finishOwned]);
  const startItemTree = useCallback(
    (treeId: string, input: InteractionInput): boolean => {
      if (stateRef.current.ownership.phase === "active") {
        return false;
      }
      const ownership = transitionInteractionOwnership(stateRef.current.ownership, {
        request: {
          input,
          itemMovementEnabled: true,
          layoutEnabled,
          sectionMode,
          structureEnabled,
          surface: "item-handle",
          viewportOverride: false,
        },
        type: "start",
      });
      if (ownership.owner !== "item-tree") {
        return false;
      }
      const next = { itemTreeId: treeId, ownership, structuralSession: null };
      stateRef.current = next;
      stageActivation(next);
      deferBroadcast(() => {
        activationStore.publishStaged();
        setState(next);
      });
      return true;
    },
    [
      activationStore,
      deferBroadcast,
      layoutEnabled,
      sectionMode,
      stageActivation,
      structureEnabled,
    ],
  );
  const finishItemTree = useCallback(
    (treeId: string, type: "cancel" | "complete") => {
      if (
        stateRef.current.ownership.owner === "item-tree" &&
        stateRef.current.itemTreeId === treeId
      ) {
        finish(type);
      }
    },
    [finish],
  );
  const announceSectionStructure = useCallback((announcement: string) => {
    setAnnouncementText(announcement);
  }, []);
  const activationPolicy = useMemo(
    () => resolveInteractionActivationPolicy(state.ownership, sectionMode),
    [sectionMode, state.ownership],
  );

  return {
    activationPolicy,
    activationStore,
    activeItemTreeId: state.itemTreeId,
    activeInput: state.structuralSession?.input ?? null,
    activeSectionId: state.structuralSession?.sectionId ?? null,
    activeSectionMode: state.structuralSession?.mode ?? null,
    announceSectionStructure,
    announcementText,
    cancel,
    cancelSectionStructure,
    complete,
    completeRootLayout,
    completeViewport,
    finishItemTree,
    ownership: state.ownership,
    startRootLayout,
    startItemTree,
    startSectionStructure,
    startViewport,
  };
}
