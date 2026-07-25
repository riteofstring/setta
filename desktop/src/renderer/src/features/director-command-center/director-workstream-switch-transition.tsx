import type { DirectorSnapshot, DirectorWorkstreamEntry } from "@generated/backend";
import { useEffect, useRef, useState } from "react";

export type DirectorWorkstreamSwitchDirection = "jump" | "next" | "previous";

export interface DirectorWorkstreamSwitchTransition {
  readonly active: boolean;
  readonly direction: DirectorWorkstreamSwitchDirection | null;
  readonly key: number;
}

const emptyDirectorWorkstreamEntries: readonly DirectorWorkstreamEntry[] = [];
const workstreamSwitchTransitionMs = 360;

export function useDirectorWorkstreamSwitchTransition(
  snapshot: DirectorSnapshot | null,
): DirectorWorkstreamSwitchTransition {
  const selectedWorkstreamId = snapshot?.selectedWorkstreamId ?? null;
  const workstreams = snapshot?.workstreams ?? emptyDirectorWorkstreamEntries;
  const previousSelectedWorkstreamIdRef = useRef<string | null>(selectedWorkstreamId);
  const transitionSerialRef = useRef(0);
  const [transition, setTransition] = useState<DirectorWorkstreamSwitchTransition>({
    active: false,
    direction: null,
    key: 0,
  });

  useEffect(() => {
    const previousSelectedWorkstreamId = previousSelectedWorkstreamIdRef.current;
    const direction = directorWorkstreamSwitchTransition(
      previousSelectedWorkstreamId,
      selectedWorkstreamId,
      workstreams,
    );
    previousSelectedWorkstreamIdRef.current = selectedWorkstreamId;
    if (direction === null) {
      return;
    }

    const key = transitionSerialRef.current + 1;
    transitionSerialRef.current = key;
    setTransition({ active: true, direction, key });
    const timeout = globalThis.setTimeout(() => {
      setTransition((current) => (current.key === key ? { ...current, active: false } : current));
    }, workstreamSwitchTransitionMs);
    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [selectedWorkstreamId, workstreams]);

  return transition;
}

export function WorkstreamSwitchTransition({
  transition,
}: {
  transition: DirectorWorkstreamSwitchTransition;
}) {
  if (!transition.active || transition.direction === null) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="director-workstream-transition"
      data-direction={transition.direction}
      key={transition.key}
    />
  );
}

export function directorWorkstreamSwitchTransition(
  previousSelectedWorkstreamId: string | null,
  selectedWorkstreamId: string | null,
  entries: readonly DirectorWorkstreamEntry[],
): DirectorWorkstreamSwitchDirection | null {
  if (
    previousSelectedWorkstreamId === null ||
    selectedWorkstreamId === null ||
    previousSelectedWorkstreamId === selectedWorkstreamId
  ) {
    return null;
  }
  const previousIndex = workstreamEntryIndexById(entries, previousSelectedWorkstreamId);
  const selectedIndex = workstreamEntryIndexById(entries, selectedWorkstreamId);
  if (previousIndex === -1 || selectedIndex === -1) {
    return "jump";
  }
  if (selectedIndex === previousIndex) {
    return null;
  }
  return selectedIndex > previousIndex ? "next" : "previous";
}

function workstreamEntryIndexById(
  entries: readonly DirectorWorkstreamEntry[],
  workstreamId: string,
): number {
  return entries.findIndex((entry) => entry.workstream.id === workstreamId);
}
