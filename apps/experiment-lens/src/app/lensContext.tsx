import { createContext, useContext } from "react";

import type {
  ArtifactRange,
  JsonScalar,
  LensSelection,
  LensSnapshot,
  Observation,
  SelectionAnnotation,
} from "../backend/generatedContract";
import type { FieldExtent, TimelineState } from "./lensModel";

export type LensActions = Readonly<{
  clearFilters: () => void;
  deleteAnnotation: (annotationId: string) => void;
  exportSelection: () => Promise<void>;
  focusObservation: (observationId: string) => void;
  openComparison: () => void;
  saveAnnotation: (annotation: SelectionAnnotation) => void;
  selectObservations: (
    observationIds: readonly string[],
    additive: boolean,
  ) => void;
  setCategoricalFilter: (
    fieldId: string,
    values: readonly JsonScalar[],
    allValues: readonly JsonScalar[],
  ) => void;
  setRange: (range: ArtifactRange) => void;
  setRangeFilter: (
    fieldId: string,
    minimum: number | null,
    maximum: number | null,
    extent: FieldExtent,
  ) => void;
  setTimelineCursor: (artifactId: string, cursor: number | null) => void;
  toggleArtifact: (artifactId: string) => void;
  toggleObservation: (observationId: string) => void;
}>;

export type LensContextValue = Readonly<{
  actions: LensActions;
  busy: boolean;
  comparisonRequest: number;
  error: string | null;
  focused: Observation | null;
  selection: LensSelection;
  snapshot: LensSnapshot;
  timeline: TimelineState;
  visible: readonly Observation[];
}>;

export const LensContext = createContext<LensContextValue | null>(null);

export function useLens(): LensContextValue {
  const value = useContext(LensContext);
  if (!value) {
    throw new Error("Experiment Lens sections require LensContext.");
  }
  return value;
}
