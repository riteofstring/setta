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

export type FieldChoice = Readonly<{
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

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function observationIds(snapshot: LensSnapshot): Set<string> {
  return new Set(snapshot.observations.map((observation) => observation.id));
}

function artifactIds(snapshot: LensSnapshot): Set<string> {
  return new Set(snapshot.experiment.artifacts.map((artifact) => artifact.id));
}

function rangeIds(ranges: readonly ArtifactRange[]): Set<string> {
  return new Set(ranges.map((range) => range.id));
}

function validNote(
  note: SelectionNote,
  observations: ReadonlySet<string>,
  artifacts: ReadonlySet<string>,
  ranges: ReadonlySet<string>,
): boolean {
  return (
    note.text.trim() !== "" &&
    (note.observationId === null || observations.has(note.observationId)) &&
    (note.artifactId === null || artifacts.has(note.artifactId)) &&
    (note.rangeId === null || ranges.has(note.rangeId))
  );
}

export function normalizeLensSelection(
  snapshot: LensSnapshot,
  selection: LensSelection,
): LensSelection {
  const observations = observationIds(snapshot);
  const artifacts = artifactIds(snapshot);
  const selectedObservationIds = uniqueStrings(
    selection.selectedObservationIds.filter((id) => observations.has(id)),
  );
  const ranges = selection.ranges.filter(
    (range) =>
      artifacts.has(range.artifactId) &&
      Number.isFinite(range.start) &&
      Number.isFinite(range.end) &&
      range.start <= range.end,
  );
  const validRanges = rangeIds(ranges);
  const firstObservationId = snapshot.observations[0]?.id ?? null;
  return {
    filters: selection.filters.filter((filter) =>
      snapshot.experiment.fields.some((field) => field.id === filter.fieldId),
    ),
    focusedObservationId:
      selection.focusedObservationId !== null &&
      observations.has(selection.focusedObservationId)
        ? selection.focusedObservationId
        : selection.focusedObservationId === null
          ? null
          : firstObservationId,
    selectedObservationIds,
    selectedArtifactIds: uniqueStrings(
      selection.selectedArtifactIds.filter((id) => artifacts.has(id)),
    ),
    ranges,
    notes: selection.notes.filter((note) =>
      validNote(note, observations, artifacts, validRanges),
    ),
  };
}

export function findField(
  snapshot: LensSnapshot,
  fieldId: string,
): FieldDefinition | undefined {
  return snapshot.experiment.fields.find((field) => field.id === fieldId);
}

export function numericFields(snapshot: LensSnapshot): FieldDefinition[] {
  return snapshot.experiment.fields.filter(
    (field) => field.valueType === "number",
  );
}

export function categoricalFactorFields(
  snapshot: LensSnapshot,
): FieldDefinition[] {
  return snapshot.experiment.fields.filter(
    (field) => field.role === "factor" && field.valueType !== "number",
  );
}

export function numericFactorFields(snapshot: LensSnapshot): FieldDefinition[] {
  return snapshot.experiment.fields.filter(
    (field) => field.role === "factor" && field.valueType === "number",
  );
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

export function artifactsForObservation(
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
): ResolvedArtifact | null {
  return (
    artifactsForObservation(snapshot, observationId).find(
      (artifact) =>
        artifact.reference.mediaType === "application/vnd.setta.series+json",
    ) ?? null
  );
}

export function displayArtifactForObservation(
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
  const timed = relations.filter((relation) => relation.timeline !== null);
  const selectedRelation =
    cursor === null || timed.length === 0
      ? (timed[0] ?? relations[0] ?? null)
      : timed.reduce((nearest, relation) =>
          Math.abs((relation.timeline?.value ?? 0) - cursor) <
          Math.abs((nearest.timeline?.value ?? 0) - cursor)
            ? relation
            : nearest,
        );
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
  const matchingAxis = snapshot.artifacts.find(
    (candidate) =>
      candidate.status === "resolved" &&
      candidate.content.kind === "series" &&
      candidate.content.series.axis.id === relation.timeline?.axisId,
  );
  const axis =
    matchingAxis?.status === "resolved" &&
    matchingAxis.content.kind === "series"
      ? matchingAxis.content.series.axis
      : null;
  return {
    axisId: relation.timeline.axisId,
    label: axis?.label ?? relation.timeline.axisId,
    unit: axis?.unit ?? null,
    value: relation.timeline.value,
  };
}

export function formatScalar(
  value: JsonScalar | undefined,
  field?: FieldDefinition,
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    const magnitude = Math.abs(value);
    const formatted =
      magnitude !== 0 && magnitude < 0.01
        ? value.toPrecision(3)
        : new Intl.NumberFormat(undefined, {
            maximumFractionDigits: magnitude < 10 ? 3 : 1,
          }).format(value);
    return field?.unit ? `${formatted} ${field.unit}` : formatted;
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
