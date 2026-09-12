import { createContext, useContext } from "react";

import type {
  ApplicationSnapshotV1,
  ProjectDraftV1,
  ProjectV1,
} from "../backend/generatedContract";

type BenchProjectTransform = (project: ProjectV1) => ProjectDraftV1;

export type BenchActions = {
  cancelRun: (runId: string) => Promise<boolean>;
  importCandidate: (bundleDirectory: string) => Promise<boolean>;
  launch: () => Promise<boolean>;
  replaceProject: (transform: BenchProjectTransform) => Promise<boolean>;
  rerun: (runId: string) => Promise<boolean>;
  saveReview: (input: {
    leftRunId: string;
    rightRunId: string;
    preferredRunId: string | null;
    note: string;
  }) => Promise<boolean>;
};

export type BenchSelection = {
  activeCaseId: string | null;
  activeRunId: string | null;
  comparedRunIds: readonly [string | null, string | null];
  selectCase: (caseId: string) => void;
  selectComparedRun: (side: "left" | "right", runId: string) => void;
  selectRun: (runId: string) => void;
};

type BenchContextValue = {
  actions: BenchActions;
  error: string | null;
  pendingAction: string | null;
  selection: BenchSelection;
  snapshot: ApplicationSnapshotV1;
};

export const BenchContext = createContext<BenchContextValue | null>(null);

export function useBench(): BenchContextValue {
  const value = useContext(BenchContext);
  if (value === null) {
    throw new Error("Bench content requires BenchContext.");
  }
  return value;
}

export function projectDraft(project: ProjectV1): ProjectDraftV1 {
  return {
    candidates: project.candidates,
    caseSet: project.caseSet,
    evaluator: project.evaluator,
    execution: project.execution,
    name: project.name,
    presentation: project.presentation,
  };
}
