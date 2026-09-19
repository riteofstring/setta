package contracts

func TypeScriptContract() string {
	return `import {
  validateExperimentManifestDocument,
  validateExportResultDocument,
  validateLensMutationDocument,
  validateLensSnapshotDocument,
  validateMutationResultDocument,
  validateObservationSourceDocument,
  validateSelectionPacketDocument,
  validateSeriesDocument,
  validateStructuredErrorDocument,
} from "./generatedValidators.js";

export type JsonScalar = null | boolean | number | string;
export type JsonValue =
  | JsonScalar
  | Array<JsonValue>
  | { [key: string]: JsonValue };

type ProducerIdentity =
  | { kind: "agent"; name: string; model: string; harness: string }
  | { kind: "human" | "application" | "script"; name: string };

type Provenance = { producer: ProducerIdentity; createdAt: string };

export type FieldDefinition = {
  id: string;
  label: string;
  description: string;
  role: "factor" | "metric" | "timestamp";
  valueType: "number" | "string" | "boolean" | "timestamp";
  unit: string | null;
  nullable: boolean;
};

type ObservationReference = {
  path: string;
  byteLength: number;
  sha256: string;
};

export type ArtifactReference = {
  id: string;
  label: string;
  path: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
};

type ArtifactRelation = {
  observationId: string;
  artifactId: string;
  role: string;
  timeline: { axisId: string; value: number } | null;
};

export type ExperimentManifest = {
  version: 1;
  id: string;
  title: string;
  summary: string;
  fields: Array<FieldDefinition>;
  observations: ObservationReference;
  artifacts: Array<ArtifactReference>;
  relations: Array<ArtifactRelation>;
  provenance: Provenance;
};

export type Observation = {
  id: string;
  values: { [fieldId: string]: JsonScalar };
};

export type ObservationSource = {
  version: 1;
  experimentId: string;
  observations: Array<Observation>;
};

export type FieldFilter = {
  fieldId: string;
  operator: "in" | "range";
  values: Array<JsonScalar>;
  minimum: number | null;
  maximum: number | null;
};

export type ArtifactRange = {
  id: string;
  artifactId: string;
  artifactSha256: string;
  axisId: string;
  start: number;
  end: number;
};

export type SelectionNote = {
  id: string;
  text: string;
  observationId: string | null;
  artifactId: string | null;
  artifactSha256: string | null;
  rangeId: string | null;
};

export type LensSelection = {
  filters: Array<FieldFilter>;
  focusedObservationId: string | null;
  selectedObservationIds: Array<string>;
  selectedArtifactIds: Array<string>;
  ranges: Array<ArtifactRange>;
  notes: Array<SelectionNote>;
};

export type LensMutation = {
  experimentId: string;
  manifestSha256: string;
  observationSourceSha256: string;
  expectedRevision: number;
  selection: LensSelection;
};

export type SeriesDocument = {
  schemaVersion: "setta-series/v1";
  axis: { id: string; label: string; unit: string | null };
  series: Array<{ id: string; label: string; unit: string | null }>;
  samples: Array<{ x: number; values: { [seriesId: string]: number | null } }>;
};

export type StructuredError = {
  code: string;
  message: string;
  field: string | null;
  artifactId: string | null;
};

export type ResolvedArtifactContent =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "json"; json: JsonValue }
  | { kind: "series"; series: SeriesDocument }
  | {
      kind: "artifact";
      route: string;
      inline: boolean;
      mediaType: string;
      byteLength: number;
      sha256: string;
    };

export type ResolvedArtifact =
  | {
      reference: ArtifactReference;
      status: "resolved";
      content: ResolvedArtifactContent;
      error: null;
    }
  | {
      reference: ArtifactReference;
      status: "failed";
      content: null;
      error: StructuredError;
    };

export type LensSnapshot = {
  version: 1;
  manifestPath: "experiment.json";
  manifestSha256: string;
  observationSourcePath: string;
  observationSourceSha256: string;
  experiment: ExperimentManifest;
  observations: Array<Observation>;
  artifacts: Array<ResolvedArtifact>;
  revision: number;
  selection: LensSelection;
};

export type SelectionPacket = {
  version: 1;
  id: string;
  experiment: { id: string; title: string; summary: string };
  source: {
    manifestPath: "experiment.json";
    manifestSha256: string;
    observationSourcePath: string;
    observationSourceSha256: string;
  };
  revision: number;
  selection: LensSelection;
  observations: Array<Observation>;
  artifacts: Array<ArtifactReference>;
};

export type MutationResult = { version: 1; snapshot: LensSnapshot };
export type ExportResult = { version: 1; packet: SelectionPacket };

export function isExperimentManifest(value: unknown): value is ExperimentManifest {
  return validateExperimentManifestDocument(value);
}

export function isObservationSource(value: unknown): value is ObservationSource {
  return validateObservationSourceDocument(value);
}

export function isLensMutation(value: unknown): value is LensMutation {
  return validateLensMutationDocument(value);
}

export function isLensSnapshot(value: unknown): value is LensSnapshot {
  return validateLensSnapshotDocument(value);
}

export function isSelectionPacket(value: unknown): value is SelectionPacket {
  return validateSelectionPacketDocument(value);
}

export function isMutationResult(value: unknown): value is MutationResult {
  return validateMutationResultDocument(value);
}

export function isExportResult(value: unknown): value is ExportResult {
  return validateExportResultDocument(value);
}

export function isStructuredError(value: unknown): value is StructuredError {
  return validateStructuredErrorDocument(value);
}

export function isSeriesDocument(value: unknown): value is SeriesDocument {
  return validateSeriesDocument(value);
}
`
}
