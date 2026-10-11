import {
  commitWorkspaceDocument,
  createWorkspaceHost,
  isWorkspaceSavedViewSectionVisible,
  setWorkspaceCapabilities,
  setWorkspaceColorMode,
  setWorkspaceMiniMapVisibility,
  setWorkspaceSectionAttention,
  type WorkspaceHost,
} from "@riteofstring/setta";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyLensMutation,
  exportLensSelection,
  fetchLensSnapshot,
  LensClientError,
  subscribeLensSnapshots,
} from "../api/client";
import type {
  ArtifactRange,
  LensSelection,
  LensSnapshot,
  SelectionPacket,
} from "../api/generatedContract";
import { ExperimentLensView } from "./ExperimentLensView";
import { LensContext, type LensActions } from "./lensContext";
import {
  deleteSelectionAnnotation,
  focusObservation,
  focusedObservation,
  replaceSelectedObservations,
  selectObservationGroup,
  setArtifactRange,
  setInFilter,
  setRangeFilter,
  setSelectionAnnotation,
  toggleSelectedObservation,
  visibleObservations,
  type FieldExtent,
  type TimelineState,
} from "./lensModel";
import { presentationSectionIds, projectLensDocument } from "./lensProjection";
import { registerLensSectionKinds } from "./lensSectionKinds";

type ReadyLens = Readonly<{
  host: WorkspaceHost;
  snapshot: LensSnapshot;
}>;

const INSPECTION_SECTION_TYPES = ["gallery", "table", "timeline"] as const;

function errorMessage(error: unknown): string {
  if (error instanceof LensClientError || error instanceof Error) {
    return error.message;
  }
  return "Experiment Lens could not complete the operation.";
}

function downloadPacket(snapshot: LensSnapshot, packet: SelectionPacket): void {
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
  const document = host.getSnapshot();
  const visible = sectionIds.filter(
    (id) =>
      Object.hasOwn(document.sections, id) &&
      isWorkspaceSavedViewSectionVisible(document.savedViews, {}, id),
  );
  if (visible.length > 0) setWorkspaceSectionAttention(host, visible);
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [comparisonRequest, setComparisonRequest] = useState(0);
  const readyRef = useRef<ReadyLens | null>(null);
  const selectionRef = useRef<LensSelection | null>(null);
  const pendingRef = useRef(0);
  const nextRevisionRef = useRef(0);
  const saveBlockedRef = useRef(false);
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
        commitWorkspaceDocument(host, projectLensDocument(snapshot));
      }
      const next = { host, snapshot };
      readyRef.current = next;
      setReady(next);
      if (!preserveOptimistic) {
        selectionRef.current = snapshot.selection;
        setSelection(snapshot.selection);
      }
      return true;
    },
    [],
  );

  useEffect(() => {
    setError(null);
    const host = createWorkspaceHost();
    registerLensSectionKinds(host);
    setWorkspaceCapabilities(host, {
      canEditLayout: true,
      canEditStructure: false,
    });
    setWorkspaceMiniMapVisibility(host, false);
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
              acceptSnapshot(
                host,
                nextSnapshot,
                pendingRef.current > 0 || saveBlockedRef.current,
              );
              setError(null);
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
  }, [acceptSnapshot, loadAttempt]);

  const recoverSelection = useCallback(
    async (caught: unknown) => {
      if (!readyRef.current) return;
      saveBlockedRef.current = true;
      setSaveError(
        caught instanceof LensClientError && caught.status === 409
          ? "The saved selection changed in another window. Your draft is kept here."
          : `Your draft is kept here, but saving could not be confirmed. ${errorMessage(caught)}`,
      );
      try {
        const refreshed = await fetchLensSnapshot();
        const current = readyRef.current;
        if (current) {
          acceptSnapshot(current.host, refreshed, true);
        }
      } catch (refreshError) {
        setError(
          `Could not load the saved selection. ${errorMessage(refreshError)}`,
        );
      }
    },
    [acceptSnapshot],
  );

  const enqueueSelection = useCallback(
    (desired: LensSelection): void => {
      const snapshot = readyRef.current?.snapshot;
      if (!snapshot || saveBlockedRef.current) return;
      const expectedRevision =
        pendingRef.current === 0 ? snapshot.revision : nextRevisionRef.current;
      nextRevisionRef.current = expectedRevision + 1;
      pendingRef.current += 1;
      setBusy(true);
      const operation = async () => {
        try {
          if (saveBlockedRef.current) return;
          const current = readyRef.current;
          if (!current) {
            return;
          }
          const result = await applyLensMutation({
            experimentId: current.snapshot.experiment.id,
            expectedRevision,
            manifestSha256: current.snapshot.manifestSha256,
            observationSourceSha256: current.snapshot.observationSourceSha256,
            selection: desired,
          });
          acceptSnapshot(current.host, result.snapshot, pendingRef.current > 1);
        } catch (caught) {
          await recoverSelection(caught);
        } finally {
          pendingRef.current -= 1;
          if (pendingRef.current === 0) {
            setBusy(false);
            const current = readyRef.current;
            if (current && !saveBlockedRef.current) {
              selectionRef.current = current.snapshot.selection;
              setSelection(current.snapshot.selection);
            }
          }
        }
      };
      const queued = mutationChainRef.current.then(operation, operation);
      mutationChainRef.current = queued.catch(() => {});
    },
    [acceptSnapshot, recoverSelection],
  );

  const replaceSelection = useCallback(
    (build: (current: LensSelection) => LensSelection): void => {
      window.setTimeout(() => {
        const current = selectionRef.current;
        if (!current) return;
        const desired = build(current);
        if (sameSelection(current, desired)) return;
        selectionRef.current = desired;
        setSelection(desired);
        enqueueSelection(desired);
      }, 0);
    },
    [enqueueSelection],
  );

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (pendingRef.current > 0 || saveBlockedRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, []);

  const saveDraft = () => {
    const draft = selectionRef.current;
    if (!draft || pendingRef.current > 0) return;
    saveBlockedRef.current = false;
    setSaveError(null);
    enqueueSelection(draft);
  };

  const useSavedSelection = async () => {
    if (pendingRef.current > 0) return;
    setBusy(true);
    try {
      const snapshot = await fetchLensSnapshot();
      const current = readyRef.current;
      if (current && acceptSnapshot(current.host, snapshot)) {
        saveBlockedRef.current = false;
        setSaveError(null);
        setError(null);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const actions = useMemo<LensActions>(
    () => ({
      clearFilters: () =>
        replaceSelection((current) => ({ ...current, filters: [] })),
      deleteAnnotation: (annotationId) =>
        replaceSelection((current) =>
          deleteSelectionAnnotation(current, annotationId),
        ),
      exportSelection: async () => {
        await mutationChainRef.current;
        if (saveBlockedRef.current) return;
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
            ...presentationSectionIds(
              current.snapshot,
              INSPECTION_SECTION_TYPES,
            ),
          ]);
        }
      },
      openComparison: () => {
        window.setTimeout(() => setComparisonRequest((value) => value + 1), 0);
      },
      saveAnnotation: (annotation) =>
        replaceSelection((current) =>
          setSelectionAnnotation(current, annotation),
        ),
      replaceSelectedObservations: (observationIds) =>
        replaceSelection((current) =>
          replaceSelectedObservations(current, observationIds),
        ),
      selectObservationGroup: (observationIds, additive) =>
        replaceSelection((current) =>
          selectObservationGroup(current, observationIds, additive),
        ),
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
      setTimelineCursor: (artifactId, cursor) => {
        window.setTimeout(() => setTimeline({ artifactId, cursor }), 0);
      },
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
    [replaceSelection],
  );

  if (!ready || !selection) {
    return (
      <main className="lens-loading">
        <div aria-hidden="true" className="lens-loading-mark" />
        <p role={error ? "alert" : "status"}>
          {error ?? "Opening experiment…"}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => setLoadAttempt((value) => value + 1)}
          >
            Try again
          </button>
        ) : null}
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
      <ExperimentLensView
        host={ready.host}
        recovery={
          saveError
            ? {
                message: saveError,
                saveDraft,
                useSavedSelection: () => void useSavedSelection(),
              }
            : null
        }
      />
    </LensContext.Provider>
  );
}
