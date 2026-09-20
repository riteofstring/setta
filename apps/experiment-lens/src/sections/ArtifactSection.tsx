import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  WorkspaceCarousel,
  type WorkspaceCarouselItem,
  useIsScrollable,
} from "@setta/workspace";
import { useEffect, useRef, useState } from "react";

import type {
  ArtifactReference,
  JsonValue,
  LensSnapshot,
  ResolvedArtifact,
  ResolvedArtifactContent,
  SelectionAnnotation,
} from "../backend/generatedContract";
import { useLens } from "../app/lensContext";
import {
  artifactAnnotationFor,
  artifactsForObservationRoles,
  artifactTimeline,
  formatScalar,
  seriesArtifactForAxis,
} from "../app/lensModel";
import { presentationSection } from "../app/presentationSection";

type BinaryArtifactContent = Extract<
  ResolvedArtifactContent,
  { kind: "artifact" }
>;

function ArtifactFailure({ message }: { message: string }) {
  return (
    <div className="lens-artifact-failure" role="alert">
      <strong>Artifact unavailable</strong>
      <span>{message}</span>
    </div>
  );
}

function JsonArtifact({ value }: { value: JsonValue }) {
  return (
    <pre className="lens-artifact-code">{JSON.stringify(value, null, 2)}</pre>
  );
}

function BinaryArtifact({
  content,
  reference,
  onError,
}: {
  content: BinaryArtifactContent;
  reference: ArtifactReference;
  onError: () => void;
}) {
  if (content.mediaType.startsWith("image/")) {
    return (
      <img
        alt={reference.label}
        className="lens-artifact-image"
        draggable={false}
        onError={onError}
        src={content.route}
      />
    );
  }
  if (content.mediaType.startsWith("audio/")) {
    return (
      <audio
        className="lens-artifact-media"
        controls
        onError={onError}
        preload="metadata"
        src={content.route}
      />
    );
  }
  if (content.mediaType.startsWith("video/")) {
    return (
      <video
        aria-label={reference.label}
        className="lens-artifact-media"
        controls
        onError={onError}
        preload="metadata"
        src={content.route}
      />
    );
  }
  return (
    <div className="lens-artifact-download">
      <strong>{reference.label}</strong>
      <span>{content.mediaType}</span>
      <a href={`${content.route}?download=1`}>Download artifact</a>
    </div>
  );
}

function ArtifactContent({ artifact }: { artifact: ResolvedArtifact }) {
  const [mediaError, setMediaError] = useState(false);
  useEffect(
    () => setMediaError(false),
    [artifact.reference.id, artifact.reference.sha256],
  );
  if (artifact.status === "failed") {
    return <ArtifactFailure message={artifact.error.message} />;
  }
  if (mediaError) {
    return (
      <ArtifactFailure message="The admitted bytes changed or could not be loaded." />
    );
  }
  switch (artifact.content.kind) {
    case "artifact":
      return (
        <BinaryArtifact
          content={artifact.content}
          onError={() => setMediaError(true)}
          reference={artifact.reference}
        />
      );
    case "json":
      return <JsonArtifact value={artifact.content.json} />;
    case "text":
      return <pre className="lens-artifact-code">{artifact.content.text}</pre>;
    case "series":
      return (
        <p className="lens-empty">The series is shown in its linked chart.</p>
      );
  }
}

function artifactFrameLabel(
  frame: ReturnType<typeof artifactTimeline>,
  observationId: string,
) {
  if (frame === null) {
    return observationId;
  }
  const unit = frame.unit === null ? "" : ` ${frame.unit}`;
  return `${frame.label} ${formatScalar(frame.value)}${unit}`;
}

function ArtifactToolbar({
  artifact,
  frame,
  included,
  observationId,
  onToggle,
}: {
  artifact: ResolvedArtifact;
  frame: ReturnType<typeof artifactTimeline>;
  included: boolean;
  observationId: string;
  onToggle: () => void;
}) {
  return (
    <div className="lens-artifact-toolbar">
      <div>
        <strong>{artifact.reference.label}</strong>
        <span>{artifactFrameLabel(frame, observationId)}</span>
      </div>
      <button aria-pressed={included} onClick={onToggle} type="button">
        {included ? "Included" : "Include artifact"}
      </button>
    </div>
  );
}

function annotationID(): string {
  return `annotation-${window.crypto.randomUUID()}`;
}

type ArtifactAnnotationFormProps = Readonly<{
  artifact: ResolvedArtifact;
  existingAnnotation: SelectionAnnotation | null;
  observationId: string;
  rangeId: string | null;
  onDelete: (annotationId: string) => void;
  onSave: (annotation: SelectionAnnotation) => void;
}>;

function annotationDraft(existingAnnotation: SelectionAnnotation | null): {
  intent: SelectionAnnotation["intent"];
  text: string;
} {
  return {
    intent: existingAnnotation?.intent ?? "context",
    text: existingAnnotation?.text ?? "",
  };
}

function artifactAnnotation(
  props: ArtifactAnnotationFormProps,
  intent: SelectionAnnotation["intent"],
  text: string,
): SelectionAnnotation {
  return {
    artifactId: props.artifact.reference.id,
    artifactSha256: props.artifact.reference.sha256,
    chartFieldIds: [],
    filters: [],
    id: props.existingAnnotation?.id ?? annotationID(),
    intent,
    kind: "artifact",
    observationIds: [props.observationId],
    rangeId: props.rangeId,
    sectionId: null,
    strokes: [],
    text,
    viewId: null,
  };
}

function annotationSaveDisabled(
  text: string,
  intent: SelectionAnnotation["intent"],
  existing: ReturnType<typeof annotationDraft>,
): boolean {
  return (
    text.trim() === "" ||
    (text.trim() === existing.text && intent === existing.intent)
  );
}

function ArtifactAnnotationDelete({
  annotation,
  onDelete,
}: {
  annotation: SelectionAnnotation | null;
  onDelete: (annotationId: string) => void;
}) {
  if (!annotation) {
    return null;
  }
  return (
    <button onClick={() => onDelete(annotation.id)} type="button">
      Delete
    </button>
  );
}

function ArtifactAnnotationForm(props: ArtifactAnnotationFormProps) {
  const existing = annotationDraft(props.existingAnnotation);
  const [text, setText] = useState(existing.text);
  const [intent, setIntent] = useState<SelectionAnnotation["intent"]>(
    existing.intent,
  );
  const textRef = useRef(existing.text);
  useEffect(() => {
    textRef.current = existing.text;
    setText(existing.text);
    setIntent(existing.intent);
  }, [existing.intent, existing.text, props.existingAnnotation?.id]);
  return (
    <form
      className="lens-artifact-annotation-form"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave(artifactAnnotation(props, intent, textRef.current));
      }}
    >
      <select
        aria-label="Artifact annotation intent"
        onChange={(event) =>
          setIntent(event.target.value as SelectionAnnotation["intent"])
        }
        value={intent}
      >
        <option value="context">Add context</option>
        <option value="question">Ask agent</option>
        <option value="follow-up">Request follow-up</option>
      </select>
      <input
        aria-label="Artifact annotation"
        defaultValue={existing.text}
        key={`${props.artifact.reference.id}:${props.existingAnnotation?.id ?? "new"}:${existing.text}`}
        onChange={(event) => {
          const value = event.currentTarget.value;
          textRef.current = value;
          window.setTimeout(() => setText(value), 0);
        }}
        placeholder="Add context or instructions for the next agent"
      />
      <button
        disabled={annotationSaveDisabled(text, intent, existing)}
        type="submit"
      >
        Save annotation
      </button>
      <ArtifactAnnotationDelete
        annotation={props.existingAnnotation}
        onDelete={props.onDelete}
      />
    </form>
  );
}

function ArtifactThumbnail({ artifact }: { artifact: ResolvedArtifact }) {
  if (
    artifact.status !== "resolved" ||
    artifact.content.kind !== "artifact" ||
    !artifact.content.mediaType.startsWith("image/")
  ) {
    return null;
  }
  return <img alt="" draggable={false} src={artifact.content.route} />;
}

function ArtifactSurface({ artifact }: { artifact: ResolvedArtifact }) {
  const { isScrollable, ref } = useIsScrollable();
  return (
    <div
      className={`lens-artifact-surface ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${isScrollable ? NO_WHEEL_CLASS_NAME : ""}`}
      data-lens-artifact-id={artifact.reference.id}
      ref={ref}
    >
      <ArtifactContent artifact={artifact} />
    </div>
  );
}

type TimedArtifact = Readonly<{
  artifact: ResolvedArtifact;
  timeline: NonNullable<ReturnType<typeof artifactTimeline>>;
}>;

function timedArtifacts(
  snapshot: LensSnapshot,
  observationId: string,
  artifacts: ResolvedArtifact[],
): TimedArtifact[] {
  return artifacts.flatMap((artifact) => {
    const timeline = artifactTimeline(
      snapshot,
      observationId,
      artifact.reference.id,
    );
    return timeline === null ? [] : [{ artifact, timeline }];
  });
}

function closestArtifactId(
  artifacts: TimedArtifact[],
  cursor: number | null,
): string | null {
  if (cursor === null || artifacts.length === 0) {
    return null;
  }
  return artifacts.reduce((nearest, entry) =>
    Math.abs(entry.timeline.value - cursor) <
    Math.abs(nearest.timeline.value - cursor)
      ? entry
      : nearest,
  ).artifact.reference.id;
}

function artifactById(
  artifacts: ResolvedArtifact[],
  artifactId: string | null,
): ResolvedArtifact | null {
  return (
    artifacts.find((artifact) => artifact.reference.id === artifactId) ?? null
  );
}

function activeArtifact(
  artifacts: ResolvedArtifact[],
  requestedArtifactId: string | null,
  linkedArtifactId: string | null,
): ResolvedArtifact | null {
  return (
    artifactById(artifacts, requestedArtifactId) ??
    artifactById(artifacts, linkedArtifactId) ??
    artifacts[0] ??
    null
  );
}

function carouselItems(
  snapshot: LensSnapshot,
  observationId: string,
  artifacts: ResolvedArtifact[],
): WorkspaceCarouselItem[] {
  return artifacts.map((artifact) => ({
    content: <ArtifactSurface artifact={artifact} />,
    id: artifact.reference.id,
    label: artifactFrameLabel(
      artifactTimeline(snapshot, observationId, artifact.reference.id),
      observationId,
    ),
    thumbnail: <ArtifactThumbnail artifact={artifact} />,
  }));
}

function timelineTarget(
  snapshot: LensSnapshot,
  observationId: string,
  artifacts: ResolvedArtifact[],
  artifactId: string,
  fallbackArtifactId: string | null,
): Readonly<{ artifactId: string; cursor: number }> | null {
  const artifact = artifactById(artifacts, artifactId);
  if (artifact === null) {
    return null;
  }
  const frame = artifactTimeline(snapshot, observationId, artifactId);
  if (frame === null) {
    return null;
  }
  const series = seriesArtifactForAxis(snapshot, observationId, frame.axisId);
  return {
    artifactId: series?.reference.id ?? fallbackArtifactId ?? artifactId,
    cursor: frame.value,
  };
}

function ArtifactCarousel({
  artifacts,
  observationId,
}: {
  artifacts: ResolvedArtifact[];
  observationId: string;
}) {
  const lens = useLens();
  const linkedActiveId = closestArtifactId(
    timedArtifacts(lens.snapshot, observationId, artifacts),
    lens.timeline.cursor,
  );
  const [requestedActiveId, setRequestedActiveId] = useState<string | null>(
    null,
  );
  useEffect(
    () => setRequestedActiveId(null),
    [lens.timeline.cursor, observationId],
  );
  const artifact = activeArtifact(artifacts, requestedActiveId, linkedActiveId);
  if (artifact === null) {
    return null;
  }
  const included = lens.selection.selectedArtifactIds.includes(
    artifact.reference.id,
  );
  const existingAnnotation = artifactAnnotationFor(
    lens.selection,
    observationId,
    artifact.reference.id,
  );
  const frame = artifactTimeline(
    lens.snapshot,
    observationId,
    artifact.reference.id,
  );
  const items = carouselItems(lens.snapshot, observationId, artifacts);

  const activateArtifact = (artifactId: string) => {
    setRequestedActiveId(artifactId);
    const target = timelineTarget(
      lens.snapshot,
      observationId,
      artifacts,
      artifactId,
      lens.timeline.artifactId,
    );
    if (target !== null) {
      lens.actions.setTimelineCursor(target.artifactId, target.cursor);
    }
  };

  return (
    <div
      className="lens-gallery"
      data-lens-active-artifact-id={artifact.reference.id}
      data-lens-section="gallery"
    >
      <ArtifactToolbar
        artifact={artifact}
        frame={frame}
        included={included}
        observationId={observationId}
        onToggle={() => lens.actions.toggleArtifact(artifact.reference.id)}
      />
      <WorkspaceCarousel
        activeItemId={artifact.reference.id}
        ariaLabel={`Artifacts for ${observationId}`}
        items={items}
        onActiveItemChange={activateArtifact}
      />
      <ArtifactAnnotationForm
        artifact={artifact}
        existingAnnotation={existingAnnotation}
        observationId={observationId}
        onDelete={lens.actions.deleteAnnotation}
        onSave={lens.actions.saveAnnotation}
        rangeId={
          lens.selection.ranges.find(
            (range) => range.artifactId === artifact.reference.id,
          )?.id ?? null
        }
      />
    </div>
  );
}

export function GallerySection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const definition = presentationSection(lens.snapshot, sectionId, "gallery");
  const focused = lens.focused;
  if (!focused) {
    return (
      <p className="lens-empty">
        Select an observation to inspect its artifact.
      </p>
    );
  }
  const artifacts = artifactsForObservationRoles(
    lens.snapshot,
    focused.id,
    definition.artifactRoles,
  );
  if (artifacts.length === 0) {
    return (
      <div className="lens-empty-state">
        <strong>{focused.id}</strong>
        <span>No matching artifact is attached to this observation.</span>
      </div>
    );
  }
  return <ArtifactCarousel artifacts={artifacts} observationId={focused.id} />;
}
