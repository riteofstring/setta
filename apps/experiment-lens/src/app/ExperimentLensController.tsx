import {
  commitWorkspaceDocument,
  createWorkspaceHost,
  setWorkspaceCapabilities,
  setWorkspaceColorMode,
  setWorkspaceSectionAttention,
  type WorkspaceHost,
} from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyLensMutation,
  exportLensSelection,
  fetchLensSnapshot,
  LensClientError,
  subscribeLensSnapshots,
} from "../backend/client";
import type {
  ArtifactRange,
  LensSelection,
  LensSnapshot,
} from "../backend/generatedContract";
import { ExperimentLensView } from "./ExperimentLensView";
import { LensContext, type LensActions } from "./lensContext";
import {
  focusObservation,
  focusedObservation,
  setArtifactRange,
  setInFilter,
  setRangeFilter,
  setSelectionNote,
  toggleSelectedObservation,
  visibleObservations,
  type FieldExtent,
  type TimelineState,
} from "./lensModel";
import {
  LENS_ARTIFACT_SECTION_ID,
  LENS_COMPACT_VIEWPORT_QUERY,
  LENS_SERIES_SECTION_ID,
  LENS_TABLE_SECTION_ID,
  projectLensDocument,
} from "./lensProjection";
import { registerLensSectionKinds } from "./lensSectionKinds";

type ReadyLens = Readonly<{
  host: WorkspaceHost;
  snapshot: LensSnapshot;
}>;

function errorMessage(error: unknown): string {
  if (error instanceof LensClientError || error instanceof Error) {
    return error.message;
  }
  return "Experiment Lens could not complete the operation.";
}

function downloadPacket(snapshot: LensSnapshot, packet: unknown): void {
  const blob = new Blob([JSON.stringify(packet, null, 2), "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `${snapshot.experiment.id}-selection.json`;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function attend(host: WorkspaceHost, sectionIds: readonly string[]): void {
  requestAnimationFrame(() => {
    try {
      setWorkspaceSectionAttention(host, sectionIds);
    } catch {
      return;
    }
  });
}

function sameSelection(left: LensSelection, right: LensSelection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function ExperimentLensController() {
  const [ready, setReady] = useState<ReadyLens | null>(null);
  const [selection, setSelection] = useState<LensSelection | null>(null);
  const [timeline, setTimeline] = useState<TimelineState>({
    artifactId: null,
    cursor: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comparisonRequest, setComparisonRequest] = useState(0);
  const readyRef = useRef<ReadyLens | null>(null);
  const selectionRef = useRef<LensSelection | null>(null);
  const pendingRef = useRef(0);
  const mutationChainRef = useRef(Promise.resolve());

  const acceptSnapshot = useCallback(
    (
      host: WorkspaceHost,
      snapshot: LensSnapshot,
      preserveOptimistic = false,
    ): boolean => {
      const current = readyRef.current;
      if (
        current &&
        (snapshot.experiment.id !== current.snapshot.experiment.id ||
          snapshot.revision < current.snapshot.revision)
      ) {
        return false;
      }
      if (!current) {
        commitWorkspaceDocument(
          host,
          projectLensDocument(snapshot, {
            compact: window.matchMedia(LENS_COMPACT_VIEWPORT_QUERY).matches,
          }),
        );
      }
      const next = { host, snapshot };
      readyRef.current = next;
      setReady(next);
      if (!preserveOptimistic) {
        selectionRef.current = snapshot.selection;
        setSelection(snapshot.selection);
      }
      setError(null);
      return true;
    },
    [],
  );

  useEffect(() => {
    const host = createWorkspaceHost();
    registerLensSectionKinds(host);
    setWorkspaceCapabilities(host, {
      canEditLayout: true,
      canEditStructure: false,
    });
    setWorkspaceColorMode(host, "system");
    let active = true;
    let disconnect = () => {};
    const initialize = async () => {
      try {
        const snapshot = await fetchLensSnapshot();
        if (!active) {
          return;
        }
        acceptSnapshot(host, snapshot);
        disconnect = subscribeLensSnapshots({
          onError: () => {
            if (active) {
              setError("Live updates are reconnecting.");
            }
          },
          onInvalid: (streamError) => {
            if (active) {
              setError(errorMessage(streamError));
            }
          },
          onSnapshot: (nextSnapshot) => {
            if (active) {
              acceptSnapshot(host, nextSnapshot, pendingRef.current > 0);
            }
          },
        });
      } catch (caught) {
        if (active) {
          setError(errorMessage(caught));
        }
      }
    };
    void initialize();
    return () => {
      active = false;
      disconnect();
      readyRef.current = null;
      selectionRef.current = null;
      host.dispose();
    };
  }, [acceptSnapshot]);

  const replaceSelection = useCallback(
    (build: (current: LensSelection) => LensSelection): void => {
      const currentSelection = selectionRef.current;
      if (!currentSelection) {
        return;
      }
      const desired = build(currentSelection);
      if (sameSelection(currentSelection, desired)) {
        return;
      }
      selectionRef.current = desired;
      setSelection(desired);
      pendingRef.current += 1;
      setBusy(true);
      const operation = async () => {
        try {
          const current = readyRef.current;
          if (!current) {
            throw new Error("Experiment Lens is still loading.");
          }
          const result = await applyLensMutation({
            experimentId: current.snapshot.experiment.id,
            expectedRevision: current.snapshot.revision,
            manifestSha256: current.snapshot.manifestSha256,
            observationSourceSha256: current.snapshot.observationSourceSha256,
            selection: desired,
          });
          acceptSnapshot(current.host, result.snapshot, pendingRef.current > 1);
        } catch (caught) {
          setError(errorMessage(caught));
          if (caught instanceof LensClientError && caught.status === 409) {
            try {
              const refreshed = await fetchLensSnapshot();
              const current = readyRef.current;
              if (current) {
                acceptSnapshot(current.host, refreshed, false);
              }
            } catch (refreshError) {
              setError(errorMessage(refreshError));
            }
          }
        } finally {
          pendingRef.current -= 1;
          if (pendingRef.current === 0) {
            setBusy(false);
            const current = readyRef.current;
            if (current) {
              selectionRef.current = current.snapshot.selection;
              setSelection(current.snapshot.selection);
            }
          }
        }
      };
      const queued = mutationChainRef.current.then(operation, operation);
      mutationChainRef.current = queued.catch(() => {});
    },
    [acceptSnapshot],
  );

  const actions = useMemo<LensActions>(
    () => ({
      addNote: (observationId, artifact, text) =>
        replaceSelection((current) => {
          const rangeId =
            current.ranges.find(
              (range) => range.artifactId === timeline.artifactId,
            )?.id ?? null;
          return setSelectionNote(current, {
            artifactId: artifact?.reference.id ?? null,
            artifactSha256: artifact?.reference.sha256 ?? null,
            id: `note.${observationId}.${artifact?.reference.id ?? "observation"}`,
            observationId,
            rangeId,
            text,
          });
        }),
      clearFilters: () =>
        replaceSelection((current) => ({ ...current, filters: [] })),
      exportSelection: async () => {
        await mutationChainRef.current;
        const current = readyRef.current;
        if (!current) {
          throw new Error("Experiment Lens is still loading.");
        }
        try {
          const result = await exportLensSelection();
          downloadPacket(current.snapshot, result.packet);
          setError(null);
        } catch (caught) {
          setError(errorMessage(caught));
          throw caught;
        }
      },
      focusObservation: (observationId) => {
        replaceSelection((current) => focusObservation(current, observationId));
        const current = readyRef.current;
        if (current) {
          attend(current.host, [
            LENS_TABLE_SECTION_ID,
            LENS_SERIES_SECTION_ID,
            LENS_ARTIFACT_SECTION_ID,
          ]);
        }
      },
      openComparison: () => setComparisonRequest((value) => value + 1),
      setCategoricalFilter: (fieldId, values, allValues) =>
        replaceSelection((current) =>
          setInFilter(current, fieldId, values, allValues),
        ),
      setRange: (range: ArtifactRange) =>
        replaceSelection((current) => setArtifactRange(current, range)),
      setRangeFilter: (fieldId, minimum, maximum, extent: FieldExtent) =>
        replaceSelection((current) =>
          setRangeFilter(current, fieldId, minimum, maximum, extent),
        ),
      setTimelineCursor: (artifactId, cursor) =>
        setTimeline({ artifactId, cursor }),
      toggleArtifact: (artifactId) =>
        replaceSelection((current) => {
          const selected = new Set(current.selectedArtifactIds);
          if (selected.has(artifactId)) {
            selected.delete(artifactId);
          } else {
            selected.add(artifactId);
          }
          return { ...current, selectedArtifactIds: [...selected] };
        }),
      toggleObservation: (observationId) =>
        replaceSelection((current) =>
          toggleSelectedObservation(current, observationId),
        ),
    }),
    [replaceSelection, timeline.artifactId],
  );

  if (!ready || !selection) {
    return (
      <main className="lens-loading">
        <div aria-hidden="true" className="lens-loading-mark" />
        <p role={error ? "alert" : "status"}>
          {error ?? "Opening experiment…"}
        </p>
      </main>
    );
  }
  const focused = focusedObservation(ready.snapshot, selection);
  const visible = visibleObservations(
    ready.snapshot.observations,
    selection.filters,
  );
  return (
    <LensContext.Provider
      value={{
        actions,
        busy,
        comparisonRequest,
        error,
        focused,
        selection,
        snapshot: ready.snapshot,
        timeline,
        visible,
      }}
    >
      <ExperimentLensView host={ready.host} />
    </LensContext.Provider>
  );
}
