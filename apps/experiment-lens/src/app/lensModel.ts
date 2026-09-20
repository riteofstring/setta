import type {
  ArtifactRange,
  FieldDefinition,
  FieldFilter,
  JsonScalar,
  LensSelection,
  LensSnapshot,
  Observation,
  ResolvedArtifact,
  SeriesDocument,
  SelectionNote,
} from "../backend/generatedContract";

export type TimelineState = Readonly<{
  artifactId: string | null;
  cursor: number | null;
}>;

export type FieldExtent = Readonly<{
  maximum: number;
  minimum: number;
}>;

type FieldChoice = Readonly<{
  count: number;
  value: JsonScalar;
}>;

export function nearestSeriesSampleX(
  samples: SeriesDocument["samples"],
  target: number,
): number | null {
  if (samples.length === 0 || !Number.isFinite(target)) {
    return null;
  }
  return samples.reduce((current, sample) =>
    Math.abs(sample.x - target) < Math.abs(current.x - target)
      ? sample
      : current,
  ).x;
}

export function numericMetricFields(snapshot: LensSnapshot): FieldDefinition[] {
  return snapshot.experiment.fields.filter(
    (field) => field.role === "metric" && field.valueType === "number",
  );
}

export function fieldExtent(
  observations: readonly Observation[],
  fieldId: string,
): FieldExtent | null {
  const values = observations
    .map((observation) => observation.values[fieldId])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  if (values.length === 0) {
    return null;
  }
  return { maximum: Math.max(...values), minimum: Math.min(...values) };
}

function scalarKey(value: JsonScalar): string {
  return `${typeof value}:${String(value)}`;
}

export function fieldChoices(
  observations: readonly Observation[],
  fieldId: string,
): FieldChoice[] {
  const counts = new Map<string, FieldChoice>();
  for (const observation of observations) {
    const value = observation.values[fieldId] ?? null;
    const key = scalarKey(value);
    const existing = counts.get(key);
    counts.set(key, { count: (existing?.count ?? 0) + 1, value });
  }
  return [...counts.values()].sort((left, right) =>
    String(left.value).localeCompare(String(right.value), undefined, {
      numeric: true,
    }),
  );
}

function matchesFilter(observation: Observation, filter: FieldFilter): boolean {
  const value = observation.values[filter.fieldId] ?? null;
  if (filter.operator === "in") {
    const accepted = new Set(filter.values.map(scalarKey));
    return accepted.has(scalarKey(value));
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  return (
    (filter.minimum === null || value >= filter.minimum) &&
    (filter.maximum === null || value <= filter.maximum)
  );
}

export function visibleObservations(
  observations: readonly Observation[],
  filters: readonly FieldFilter[],
): Observation[] {
  return observations.filter((observation) =>
    filters.every((filter) => matchesFilter(observation, filter)),
  );
}

export function setInFilter(
  selection: LensSelection,
  fieldId: string,
  values: readonly JsonScalar[],
  allValues: readonly JsonScalar[],
): LensSelection {
  const filters = selection.filters.filter(
    (filter) => filter.fieldId !== fieldId,
  );
  if (
    values.length > 0 &&
    new Set(values.map(scalarKey)).size < new Set(allValues.map(scalarKey)).size
  ) {
    filters.push({
      fieldId,
      maximum: null,
      minimum: null,
      operator: "in",
      values: [...values],
    });
  }
  return { ...selection, filters };
}

export function setRangeFilter(
  selection: LensSelection,
  fieldId: string,
  minimum: number | null,
  maximum: number | null,
  extent: FieldExtent,
): LensSelection {
  const filters = selection.filters.filter(
    (filter) => filter.fieldId !== fieldId,
  );
  if (minimum !== null || maximum !== null) {
    const normalizedMinimum =
      minimum === null || minimum <= extent.minimum ? null : minimum;
    const normalizedMaximum =
      maximum === null || maximum >= extent.maximum ? null : maximum;
    if (normalizedMinimum !== null || normalizedMaximum !== null) {
      filters.push({
        fieldId,
        maximum: normalizedMaximum,
        minimum: normalizedMinimum,
        operator: "range",
        values: [],
      });
    }
  }
  return { ...selection, filters };
}

export function focusObservation(
  selection: LensSelection,
  observationId: string,
): LensSelection {
  return { ...selection, focusedObservationId: observationId };
}

export function toggleSelectedObservation(
  selection: LensSelection,
  observationId: string,
): LensSelection {
  const selected = new Set(selection.selectedObservationIds);
  if (selected.has(observationId)) {
    selected.delete(observationId);
  } else {
    selected.add(observationId);
  }
  return {
    ...selection,
    selectedObservationIds: [...selected],
  };
}

export function focusedObservation(
  snapshot: LensSnapshot,
  selection: LensSelection,
): Observation | null {
  return (
    snapshot.observations.find(
      (observation) => observation.id === selection.focusedObservationId,
    ) ??
    snapshot.observations[0] ??
    null
  );
}

function artifactsForObservation(
  snapshot: LensSnapshot,
  observationId: string | null,
): ResolvedArtifact[] {
  if (observationId === null) {
    return [];
  }
  const artifactIds = new Set(
    snapshot.experiment.relations
      .filter((relation) => relation.observationId === observationId)
      .map((relation) => relation.artifactId),
  );
  return snapshot.artifacts.filter((artifact) =>
    artifactIds.has(artifact.reference.id),
  );
}

export function seriesArtifactForObservation(
  snapshot: LensSnapshot,
  observationId: string | null,
  role?: string,
): ResolvedArtifact | null {
  const roleArtifactIds = new Set(
    snapshot.experiment.relations
      .filter(
        (relation) =>
          relation.observationId === observationId &&
          (role === undefined || relation.role === role),
      )
      .map((relation) => relation.artifactId),
  );
  return (
    artifactsForObservation(snapshot, observationId).find(
      (artifact) =>
        roleArtifactIds.has(artifact.reference.id) &&
        artifact.reference.mediaType === "application/vnd.setta.series+json",
    ) ?? null
  );
}

export function artifactsForObservationRoles(
  snapshot: LensSnapshot,
  observationId: string | null,
  roles: readonly string[],
): ResolvedArtifact[] {
  if (observationId === null) {
    return [];
  }
  const acceptedRoles = new Set(roles);
  const artifactIds = snapshot.experiment.relations
    .filter(
      (relation) =>
        relation.observationId === observationId &&
        acceptedRoles.has(relation.role),
    )
    .map((relation) => relation.artifactId);
  const artifactsByID = new Map(
    snapshot.artifacts.map((artifact) => [artifact.reference.id, artifact]),
  );
  return [...new Set(artifactIds)]
    .map((artifactId) => artifactsByID.get(artifactId))
    .filter((artifact): artifact is ResolvedArtifact => artifact !== undefined);
}

function displayArtifactForObservation(
  snapshot: LensSnapshot,
  observationId: string | null,
): ResolvedArtifact | null {
  return (
    artifactsForObservation(snapshot, observationId).find(
      (artifact) =>
        artifact.reference.mediaType !== "application/vnd.setta.series+json",
    ) ?? null
  );
}

type ArtifactRelation = LensSnapshot["experiment"]["relations"][number];

function relationAtCursor(
  relations: readonly ArtifactRelation[],
  cursor: number | null,
): ArtifactRelation | null {
  const timed = relations.filter((relation) => relation.timeline !== null);
  if (cursor === null || timed.length === 0) {
    return timed[0] ?? relations[0] ?? null;
  }
  return timed.reduce((nearest, relation) =>
    Math.abs((relation.timeline?.value ?? 0) - cursor) <
    Math.abs((nearest.timeline?.value ?? 0) - cursor)
      ? relation
      : nearest,
  );
}

export function displayArtifactAtCursor(
  snapshot: LensSnapshot,
  observationId: string | null,
  cursor: number | null,
): ResolvedArtifact | null {
  if (observationId === null) {
    return null;
  }
  const relations = snapshot.experiment.relations.filter(
    (relation) => relation.observationId === observationId,
  );
  const selectedRelation = relationAtCursor(relations, cursor);
  if (!selectedRelation) {
    return null;
  }
  const artifact = snapshot.artifacts.find(
    (candidate) => candidate.reference.id === selectedRelation.artifactId,
  );
  if (artifact?.reference.mediaType === "application/vnd.setta.series+json") {
    return displayArtifactForObservation(snapshot, observationId);
  }
  return artifact ?? displayArtifactForObservation(snapshot, observationId);
}

export function artifactTimeline(
  snapshot: LensSnapshot,
  observationId: string | null,
  artifactId: string | null,
): {
  axisId: string;
  label: string;
  unit: string | null;
  value: number;
} | null {
  const relation = snapshot.experiment.relations.find(
    (candidate) =>
      candidate.observationId === observationId &&
      candidate.artifactId === artifactId,
  );
  if (!relation?.timeline) {
    return null;
  }
  const axis = seriesAxis(snapshot, relation.timeline.axisId);
  return {
    axisId: relation.timeline.axisId,
    label: axis?.label ?? relation.timeline.axisId,
    unit: axis?.unit ?? null,
    value: relation.timeline.value,
  };
}

function seriesAxis(snapshot: LensSnapshot, axisId: string) {
  const matchingArtifact = snapshot.artifacts.find(
    (candidate) =>
      candidate.status === "resolved" &&
      candidate.content.kind === "series" &&
      candidate.content.series.axis.id === axisId,
  );
  if (
    matchingArtifact?.status !== "resolved" ||
    matchingArtifact.content.kind !== "series"
  ) {
    return null;
  }
  return matchingArtifact.content.series.axis;
}

function formatNumber(value: number, unit?: string | null): string {
  const magnitude = Math.abs(value);
  const formatted =
    magnitude !== 0 && magnitude < 0.01
      ? value.toPrecision(3)
      : new Intl.NumberFormat(undefined, {
          maximumFractionDigits: magnitude < 10 ? 3 : 1,
        }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatScalar(
  value: JsonScalar | undefined,
  field?: FieldDefinition,
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return formatNumber(value, field?.unit);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

export function noteFor(
  selection: LensSelection,
  observationId: string,
  artifactId: string | null,
): SelectionNote | null {
  return (
    selection.notes.find(
      (note) =>
        note.observationId === observationId && note.artifactId === artifactId,
    ) ?? null
  );
}

export function setSelectionNote(
  selection: LensSelection,
  note: SelectionNote,
): LensSelection {
  const notes = selection.notes.filter((candidate) => candidate.id !== note.id);
  if (note.text.trim() !== "") {
    notes.push({ ...note, text: note.text.trim() });
  }
  return { ...selection, notes };
}

export function setArtifactRange(
  selection: LensSelection,
  range: ArtifactRange,
): LensSelection {
  return {
    ...selection,
    ranges: [
      ...selection.ranges.filter((candidate) => candidate.id !== range.id),
      range,
    ],
  };
}

export function activeRangeFor(
  selection: LensSelection,
  artifactId: string,
): ArtifactRange | null {
  return (
    selection.ranges.find((range) => range.artifactId === artifactId) ?? null
  );
}
