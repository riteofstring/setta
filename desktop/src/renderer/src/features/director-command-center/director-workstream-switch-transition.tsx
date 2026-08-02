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

/*
 * The Director's own view is a destination, not the absence of one: it leads
 * the strip, so it sits at index -1 and a move between it and any workstream
 * has a direction like any other move. Treating null as "no transition" is
 * what made the most common arrow press — Director to the only workstream —
 * switch with no animation at all.
 */
export function directorWorkstreamSwitchTransition(
  previousSelectedWorkstreamId: string | null,
  selectedWorkstreamId: string | null,
  entries: readonly DirectorWorkstreamEntry[],
): DirectorWorkstreamSwitchDirection | null {
  if (previousSelectedWorkstreamId === selectedWorkstreamId) {
    return null;
  }
  const previousIndex =
    previousSelectedWorkstreamId === null
      ? -1
      : workstreamEntryIndexById(entries, previousSelectedWorkstreamId);
  const selectedIndex =
    selectedWorkstreamId === null ? -1 : workstreamEntryIndexById(entries, selectedWorkstreamId);
  if (
    (previousSelectedWorkstreamId !== null && previousIndex === -1) ||
    (selectedWorkstreamId !== null && selectedIndex === -1)
  ) {
    return "jump";
  }
  return selectedIndex > previousIndex ? "next" : "previous";
}

function workstreamEntryIndexById(
  entries: readonly DirectorWorkstreamEntry[],
  workstreamId: string,
): number {
  return entries.findIndex((entry) => entry.workstream.id === workstreamId);
}
