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

export type WorkspaceStructuralInteractionStart = Readonly<{
  input: InteractionInput;
  mode: WorkspaceSectionMoveMode;
  root: boolean;
  sectionId: string;
  title: string;
}>;

type WorkspaceStructuralInteractionSession = Readonly<
  Pick<WorkspaceStructuralInteractionStart, "input" | "mode" | "sectionId" | "title">
>;

type WorkspaceInteractionCoordinatorState = Readonly<{
  ownership: InteractionOwnershipState;
  structuralSession: WorkspaceStructuralInteractionSession | null;
}>;

const IDLE_COORDINATOR_STATE: WorkspaceInteractionCoordinatorState = {
  ownership: IDLE_INTERACTION_OWNERSHIP,
  structuralSession: null,
};

function structuralStartAnnouncement(start: WorkspaceStructuralInteractionStart): string {
  const mode = start.mode === "sort" ? "sorting" : "free-move";
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
  sectionMode,
  structureEnabled,
}: Readonly<{
  layoutEnabled: boolean;
  sectionMode: WorkspaceSectionMoveMode;
  structureEnabled: boolean;
}>) {
  const [announcementText, setAnnouncementText] = useState("");
  const [state, setState] = useState<WorkspaceInteractionCoordinatorState>(IDLE_COORDINATOR_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    stateRef.current = {
      ...stateRef.current,
      ownership: transitionInteractionOwnership(stateRef.current.ownership, {
        sectionMode,
        type: "mode-change",
      }),
    };
  }, [sectionMode]);

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
      const next = { ownership, structuralSession: null };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [layoutEnabled, sectionMode, structureEnabled],
  );

  const startSectionStructure = useCallback(
    (start: WorkspaceStructuralInteractionStart) => {
      const ownership = transitionInteractionOwnership(stateRef.current.ownership, {
        request: {
          input: start.input,
          itemMovementEnabled: false,
          layoutEnabled,
          sectionMode: start.mode,
          structureEnabled: layoutEnabled && structureEnabled,
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
      const next = { ownership, structuralSession };
      stateRef.current = next;
      setAnnouncementText(structuralStartAnnouncement(start));
      setState(next);
    },
    [layoutEnabled, structureEnabled],
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
      const next = { ownership, structuralSession: null };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [layoutEnabled, sectionMode, structureEnabled],
  );

  const finish = useCallback((type: "cancel" | "complete") => {
    const current = stateRef.current;
    const next = {
      ownership: transitionInteractionOwnership(current.ownership, { type }),
      structuralSession: null,
    };
    stateRef.current = next;
    if (current.structuralSession) {
      setAnnouncementText(structuralEndAnnouncement(current.structuralSession, type === "cancel"));
    }
    setState(next);
  }, []);
  const cancel = useCallback(() => finish("cancel"), [finish]);
  const finishOwned = useCallback(
    (owner: InteractionOwner, type: "cancel" | "complete") => {
      if (stateRef.current.ownership.owner === owner) {
        finish(type);
      }
    },
    [finish],
  );
  const cancelSectionStructure = useCallback(
    () => finishOwned("section-structure", "cancel"),
    [finishOwned],
  );
  const complete = useCallback(() => finishOwned("section-structure", "complete"), [finishOwned]);
  const completeRootLayout = useCallback(
    () => finishOwned("root-layout", "complete"),
    [finishOwned],
  );
  const completeViewport = useCallback(() => finishOwned("viewport", "complete"), [finishOwned]);
  const activationPolicy = useMemo(
    () => resolveInteractionActivationPolicy(state.ownership, sectionMode),
    [sectionMode, state.ownership],
  );

  return {
    activationPolicy,
    activeInput: state.structuralSession?.input ?? null,
    activeSectionId: state.structuralSession?.sectionId ?? null,
    activeSectionMode: state.structuralSession?.mode ?? null,
    announcementText,
    cancel,
    cancelSectionStructure,
    complete,
    completeRootLayout,
    completeViewport,
    ownership: state.ownership,
    startRootLayout,
    startSectionStructure,
    startViewport,
  };
}
