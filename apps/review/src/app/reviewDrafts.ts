import { useEffect, useState } from "react";

import {
  validateReviewResponse,
  type ArtifactAnnotation,
  type RequestSnapshot,
  type ReviewSnapshot,
} from "../api/generatedContract";
import { changesRequestedResponse } from "./reviewModel";

const DRAFT_STORAGE_FAILURE =
  "Draft kept in memory. This browser could not save it; keep this tab open until you submit.";

export function reviewDraftKey(
  projectId: string,
  request: RequestSnapshot,
  field: string,
): string {
  return `setta-review-draft:${JSON.stringify([projectId, request.request.id, request.sha256, field])}`;
}

export function useReviewTextDraft(key: string, initial: string) {
  const [loaded] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      return {
        value: stored ?? initial,
        draft: stored !== null,
        error: null as string | null,
      };
    } catch {
      return { value: initial, draft: false, error: DRAFT_STORAGE_FAILURE };
    }
  });
  const [value, setValue] = useState(loaded.value);
  const [hasDraft, setHasDraft] = useState(loaded.draft);
  const [error, setError] = useState(loaded.error);
  useEffect(() => {
    if (!hasDraft || !error) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [error, hasDraft]);
  const update = (next: string) => {
    setValue(next);
    setHasDraft(true);
    try {
      window.sessionStorage.setItem(key, next);
      setError(null);
    } catch {
      setError(DRAFT_STORAGE_FAILURE);
    }
  };
  const saved = () => {
    try {
      window.sessionStorage.removeItem(key);
      setHasDraft(false);
      setError(null);
    } catch {
      setError("Response saved. The browser could not clear its local draft.");
    }
  };
  return {
    value,
    update,
    saved,
    hasDraft,
    status: hasDraft
      ? (error ?? "Draft saved in this tab · not submitted")
      : null,
  };
}

export function loadAnnotationDrafts(snapshot: ReviewSnapshot): {
  drafts: Record<string, readonly ArtifactAnnotation[]>;
  error: string | null;
} {
  const drafts: Record<string, readonly ArtifactAnnotation[]> = {};
  let error: string | null = null;
  for (const request of snapshot.requests) {
    try {
      const stored = window.sessionStorage.getItem(
        reviewDraftKey(snapshot.project.id, request, "annotations"),
      );
      if (stored === null) continue;
      const response: unknown = JSON.parse(stored);
      if (
        !validateReviewResponse(response) ||
        response.requestId !== request.request.id ||
        response.requestSha256 !== request.sha256 ||
        response.annotations.some(
          (annotation) =>
            !request.evidence.some(
              (evidence) =>
                evidence.evidenceId === annotation.artifactEvidenceId &&
                evidence.status === "resolved" &&
                evidence.content.kind === "artifact" &&
                evidence.content.sha256 === annotation.artifactSha256,
            ),
        )
      ) {
        error =
          "A saved drawing draft could not be restored. The review is still available.";
        continue;
      }
      drafts[request.request.id] = response.annotations;
    } catch {
      error =
        "Drawing drafts could not be restored from this browser. The review is still available.";
    }
  }
  return { drafts, error };
}

export function persistAnnotationDraft(
  snapshot: ReviewSnapshot,
  request: RequestSnapshot,
  annotations: readonly ArtifactAnnotation[] | null,
): string | null {
  try {
    const key = reviewDraftKey(snapshot.project.id, request, "annotations");
    if (annotations === null) window.sessionStorage.removeItem(key);
    else
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          ...changesRequestedResponse(request, "Drawing draft", annotations),
          status: "draft",
        }),
      );
    return null;
  } catch {
    return DRAFT_STORAGE_FAILURE;
  }
}
