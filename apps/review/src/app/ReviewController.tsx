import {
  commitWorkspaceDocument,
  createWorkspaceHost,
  fitWorkspaceSections,
  setWorkspaceColorMode,
  type WorkspaceHost,
} from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyReviewMutation,
  fetchReviewSnapshot,
  ReviewClientError,
  subscribeReviewSnapshots,
} from "../backend/client";
import type {
  ArtifactAnnotation,
  CompletionDecision,
  NormalizedPoint,
  RequestSnapshot,
  ReviewResponse,
  ReviewSnapshot,
} from "../backend/generatedContract";
import {
  ReviewContext,
  type ReviewActions,
  type ReviewSubjectSelection,
} from "./reviewContext";
import {
  changesRequestedResponse,
  completionResponse,
  findRequestSnapshot,
  selectedChoiceResponse,
} from "./reviewModel";
import {
  evidenceSectionId,
  projectReviewDocument,
  relatedSectionIds,
} from "./reviewProjection";
import { registerReviewSectionKinds } from "./reviewSectionKinds";
import { ReviewView } from "./ReviewView";

type ReadyReview = Readonly<{
  host: WorkspaceHost;
  snapshot: ReviewSnapshot;
}>;

function defaultSelection(
  snapshot: ReviewSnapshot,
): ReviewSubjectSelection | null {
  for (const request of snapshot.requests) {
    if (request.request.type === "completion") {
      const unsettled = request.request.completion.claims.find((claim) => {
        const assessments = request.assessments.filter(
          (assessment) => assessment.claimId === claim.id,
        );
        return (
          assessments.length === 0 ||
          new Set(assessments.map((assessment) => assessment.assessment)).size >
            1 ||
          assessments.some(
            (assessment) => assessment.assessment !== "supported",
          )
        );
      });
      const claim = unsettled ?? request.request.completion.claims[0];
      if (claim) {
        return {
          requestId: request.request.id,
          subjectId: claim.id,
          subjectKind: "claim",
        };
      }
    }
    if (request.request.type === "choice") {
      const factor = request.request.choice.factors[0];
      const option = request.request.choice.options[0];
      if (factor) {
        return {
          requestId: request.request.id,
          subjectId: factor.id,
          subjectKind: "factor",
        };
      }
      if (option) {
        return {
          requestId: request.request.id,
          subjectId: option.id,
          subjectKind: "option",
        };
      }
    }
  }
  return null;
}

function selectionExists(
  snapshot: ReviewSnapshot,
  selection: ReviewSubjectSelection,
): boolean {
  const request = snapshot.requests.find(
    (candidate) => candidate.request.id === selection.requestId,
  );
  if (!request) {
    return false;
  }
  if (selection.subjectKind === "claim") {
    return (
      request.request.type === "completion" &&
      request.request.completion.claims.some(
        (claim) => claim.id === selection.subjectId,
      )
    );
  }
  if (request.request.type !== "choice") {
    return false;
  }
  return selection.subjectKind === "factor"
    ? request.request.choice.factors.some(
        (factor) => factor.id === selection.subjectId,
      )
    : request.request.choice.options.some(
        (option) => option.id === selection.subjectId,
      );
}

function initialOption(request: RequestSnapshot): string | null {
  if (request.request.type !== "choice") {
    return null;
  }
  if (request.response?.type === "choice") {
    return request.response.choice.optionIds[0] ?? null;
  }
  return request.request.choice.recommendation?.optionId ?? null;
}

function selectedOptionsFor(
  snapshot: ReviewSnapshot,
  current: Readonly<Record<string, string | null>>,
): Record<string, string | null> {
  return Object.fromEntries(
    snapshot.requests
      .filter((request) => request.request.type === "choice")
      .map((request) => [
        request.request.id,
        Object.hasOwn(current, request.request.id)
          ? (current[request.request.id] ?? null)
          : initialOption(request),
      ]),
  );
}

function responseAnnotations(
  request: RequestSnapshot,
): readonly ArtifactAnnotation[] {
  return request.response?.annotations ?? [];
}

function errorMessage(error: unknown): string {
  if (error instanceof ReviewClientError || error instanceof Error) {
    return error.message;
  }
  return "Review could not complete the operation.";
}

function frameSections(
  host: WorkspaceHost,
  sectionIds: readonly string[],
): void {
  if (sectionIds.length === 0) return;
  void fitWorkspaceSections(host, sectionIds, {
    duration: 320,
    maxZoom: 0.95,
    padding: 0.12,
  });
}

export function ReviewController() {
  const [ready, setReady] = useState<ReadyReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ReviewSubjectSelection | null>(
    null,
  );
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    null,
  );
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string | null>
  >({});
  const [drawing, setDrawingState] = useState<{
    evidenceId: string;
    requestId: string;
  } | null>(null);
  const [annotationOverrides, setAnnotationOverrides] = useState<
    Record<string, readonly ArtifactAnnotation[]>
  >({});
  const readyRef = useRef<ReadyReview | null>(null);
  const annotationOverridesRef = useRef(annotationOverrides);
  const mutationChainRef = useRef(Promise.resolve());

  const acceptSnapshot = useCallback(
    (host: WorkspaceHost, snapshot: ReviewSnapshot): boolean => {
      const current = readyRef.current;
      if (
        current &&
        (snapshot.project.id !== current.snapshot.project.id ||
          snapshot.revision < current.snapshot.revision)
      ) {
        return false;
      }
      commitWorkspaceDocument(
        host,
        projectReviewDocument(snapshot, host.getSnapshot()),
      );
      const next = { host, snapshot };
      readyRef.current = next;
      setReady(next);
      setSelection((currentSelection) =>
        currentSelection && selectionExists(snapshot, currentSelection)
          ? currentSelection
          : defaultSelection(snapshot),
      );
      setSelectedOptions((currentOptions) =>
        selectedOptionsFor(snapshot, currentOptions),
      );
      setError(null);
      return true;
    },
    [],
  );

  useEffect(() => {
    const host = createWorkspaceHost();
    registerReviewSectionKinds(host);
    setWorkspaceColorMode(host, "system");
    let active = true;
    let disconnect = () => {};

    const initialize = async () => {
      try {
        const snapshot = await fetchReviewSnapshot();
        if (!active) {
          return;
        }
        acceptSnapshot(host, snapshot);
        disconnect = subscribeReviewSnapshots({
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
              acceptSnapshot(host, nextSnapshot);
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
      host.dispose();
    };
  }, [acceptSnapshot]);

  useEffect(() => {
    annotationOverridesRef.current = annotationOverrides;
  }, [annotationOverrides]);

  const annotationsForRequest = useCallback(
    (requestId: string): readonly ArtifactAnnotation[] => {
      const override = annotationOverridesRef.current[requestId];
      if (override) {
        return override;
      }
      const current = readyRef.current;
      if (!current) {
        return [];
      }
      return responseAnnotations(
        findRequestSnapshot(current.snapshot.requests, requestId),
      );
    },
    [],
  );

  const applyResponse = useCallback(
    (
      requestId: string,
      build: (snapshot: RequestSnapshot) => ReviewResponse,
    ) => {
      const operation = async () => {
        const current = readyRef.current;
        if (!current) {
          throw new Error("Review is still loading.");
        }
        setBusyRequestId(requestId);
        try {
          const request = findRequestSnapshot(
            current.snapshot.requests,
            requestId,
          );
          const response = build(request);
          const result = await applyReviewMutation({
            expectedRevision: current.snapshot.revision,
            operations: [{ op: "setResponse", response }],
            projectId: current.snapshot.project.id,
          });
          acceptSnapshot(current.host, result.snapshot);
          setAnnotationOverrides((overrides) => {
            const next = { ...overrides };
            delete next[requestId];
            return next;
          });
        } catch (caught) {
          setError(errorMessage(caught));
          if (caught instanceof ReviewClientError && caught.status === 409) {
            try {
              const refreshed = await fetchReviewSnapshot();
              const latest = readyRef.current;
              if (latest) {
                acceptSnapshot(latest.host, refreshed);
              }
            } catch (refreshError) {
              setError(errorMessage(refreshError));
            }
          }
          throw caught;
        } finally {
          setBusyRequestId(null);
        }
      };
      const queued = mutationChainRef.current.then(operation, operation);
      mutationChainRef.current = queued.catch(() => {});
      return queued;
    },
    [acceptSnapshot],
  );

  const actions = useMemo<ReviewActions>(
    () => ({
      addAnnotationStroke: (requestId, evidenceId, points) => {
        const current = readyRef.current;
        if (!current) {
          return;
        }
        const request = findRequestSnapshot(
          current.snapshot.requests,
          requestId,
        );
        const resolved = request.evidence.find(
          (candidate) => candidate.evidenceId === evidenceId,
        );
        if (
          !resolved ||
          resolved.status !== "resolved" ||
          resolved.content.kind !== "artifact"
        ) {
          setError("The selected artifact is unavailable.");
          return;
        }
        const annotations = [...annotationsForRequest(requestId)];
        const index = annotations.findIndex(
          (annotation) => annotation.artifactEvidenceId === evidenceId,
        );
        const path = {
          color: "#5ee693",
          points: points.map((point: NormalizedPoint) => ({ ...point })),
          width: 0.008,
        };
        if (index >= 0) {
          const existing = annotations[index]!;
          annotations[index] = {
            ...existing,
            paths: [...existing.paths, path],
          };
        } else {
          annotations.push({
            artifactEvidenceId: evidenceId,
            artifactSha256: resolved.content.sha256,
            id: `annotation:${requestId}:${evidenceId}`,
            paths: [path],
          });
        }
        annotationOverridesRef.current = {
          ...annotationOverridesRef.current,
          [requestId]: annotations,
        };
        setAnnotationOverrides(annotationOverridesRef.current);
      },
      clearAnnotations: (requestId, evidenceId) => {
        const annotations = annotationsForRequest(requestId).filter(
          (annotation) => annotation.artifactEvidenceId !== evidenceId,
        );
        annotationOverridesRef.current = {
          ...annotationOverridesRef.current,
          [requestId]: annotations,
        };
        setAnnotationOverrides(annotationOverridesRef.current);
      },
      confirmChoice: (requestId, rationale, conditions = []) => {
        const selected = selectedOptions[requestId];
        if (!selected) {
          return Promise.reject(
            new Error("Select an option before confirming."),
          );
        }
        return applyResponse(requestId, (request) => ({
          ...selectedChoiceResponse(request, [selected], rationale, conditions),
          annotations: [...annotationsForRequest(requestId)],
        }));
      },
      decideClaim: (requestId, decision: CompletionDecision) =>
        applyResponse(requestId, (request) =>
          completionResponse(request, decision),
        ),
      requestChanges: (requestId, rationale) =>
        applyResponse(requestId, (request) =>
          changesRequestedResponse(
            request,
            rationale,
            annotationsForRequest(requestId),
          ),
        ),
      selectEvidence: (requestId, evidenceId) => {
        setSelectedEvidenceId(evidenceId);
        const current = readyRef.current;
        if (current) {
          frameSections(current.host, [
            evidenceSectionId(requestId, evidenceId),
          ]);
        }
      },
      selectOption: (requestId, optionId) => {
        setSelectedOptions((current) => ({
          ...current,
          [requestId]: optionId,
        }));
        const nextSelection: ReviewSubjectSelection = {
          requestId,
          subjectId: optionId,
          subjectKind: "option",
        };
        setSelection(nextSelection);
        const current = readyRef.current;
        if (current) {
          frameSections(
            current.host,
            relatedSectionIds(current.snapshot, nextSelection),
          );
        }
      },
      selectSubject: (nextSelection) => {
        setSelection(nextSelection);
        const current = readyRef.current;
        if (current) {
          frameSections(
            current.host,
            relatedSectionIds(current.snapshot, nextSelection),
          );
        }
      },
      setDrawing: (requestId, evidenceId) =>
        setDrawingState(evidenceId ? { evidenceId, requestId } : null),
    }),
    [annotationsForRequest, applyResponse, selectedOptions],
  );

  const annotationsByRequest = useMemo(() => {
    if (!ready) {
      return annotationOverrides;
    }
    return Object.fromEntries(
      ready.snapshot.requests.map((request) => [
        request.request.id,
        annotationOverrides[request.request.id] ?? responseAnnotations(request),
      ]),
    );
  }, [annotationOverrides, ready]);

  if (!ready) {
    return (
      <main className="review-loading">
        <div aria-hidden="true" className="review-loading-mark" />
        <p role={error ? "alert" : "status"}>{error ?? "Opening review…"}</p>
      </main>
    );
  }

  return (
    <ReviewContext.Provider
      value={{
        actions,
        annotationsByRequest,
        busyRequestId,
        drawing,
        error,
        selectedEvidenceId,
        selectedOptions,
        selection,
        snapshot: ready.snapshot,
      }}
    >
      <ReviewView host={ready.host} />
    </ReviewContext.Provider>
  );
}
