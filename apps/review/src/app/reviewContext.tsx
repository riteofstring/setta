import { createContext, useContext } from "react";

import type {
  ArtifactAnnotation,
  CompletionDecision,
  NormalizedPoint,
  ReviewSnapshot,
} from "../backend/generatedContract";

export type ReviewSubjectSelection = Readonly<{
  requestId: string;
  subjectId: string;
  subjectKind: "claim" | "option" | "factor";
}>;

export type ReviewActions = Readonly<{
  addAnnotationStroke: (
    requestId: string,
    evidenceId: string,
    points: readonly NormalizedPoint[],
  ) => void;
  clearAnnotations: (requestId: string, evidenceId: string) => void;
  confirmChoice: (
    requestId: string,
    rationale: string,
    conditions?: readonly string[],
  ) => Promise<void>;
  decideClaim: (
    requestId: string,
    decision: CompletionDecision,
  ) => Promise<void>;
  requestChanges: (requestId: string, rationale: string) => Promise<void>;
  selectEvidence: (requestId: string, evidenceId: string) => void;
  selectOption: (requestId: string, optionId: string) => void;
  selectSubject: (selection: ReviewSubjectSelection) => void;
  setDrawing: (requestId: string, evidenceId: string | null) => void;
}>;

export type ReviewContextValue = Readonly<{
  actions: ReviewActions;
  annotationsByRequest: Readonly<Record<string, readonly ArtifactAnnotation[]>>;
  busyRequestId: string | null;
  drawing: Readonly<{ evidenceId: string; requestId: string }> | null;
  error: string | null;
  selectedEvidenceId: string | null;
  selectedOptions: Readonly<Record<string, string | null>>;
  selection: ReviewSubjectSelection | null;
  snapshot: ReviewSnapshot;
}>;

export const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview(): ReviewContextValue {
  const value = useContext(ReviewContext);
  if (!value) {
    throw new Error("Review sections require ReviewContext.");
  }
  return value;
}
