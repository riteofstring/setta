import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "@setta/workspace";
import { useEffect, useRef, useState } from "react";

import type {
  ArtifactReference,
  JsonValue,
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

function ArtifactAnnotationForm({
  artifact,
  existingAnnotation,
  observationId,
  rangeId,
  onDelete,
  onSave,
}: {
  artifact: ResolvedArtifact;
  existingAnnotation: SelectionAnnotation | null;
  observationId: string;
  rangeId: string | null;
  onDelete: (annotationId: string) => void;
  onSave: (annotation: SelectionAnnotation) => void;
}) {
  const existingText = existingAnnotation?.text ?? "";
  const [text, setText] = useState(existingText);
  const [intent, setIntent] = useState<SelectionAnnotation["intent"]>(
    existingAnnotation?.intent ?? "context",
  );
  const textRef = useRef(existingText);
  useEffect(() => {
    textRef.current = existingText;
    setText(existingText);
    setIntent(existingAnnotation?.intent ?? "context");
  }, [existingAnnotation?.id, existingAnnotation?.intent, existingText]);
  return (
    <form
      className="lens-note-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          artifactId: artifact.reference.id,
          artifactSha256: artifact.reference.sha256,
          chartFieldIds: [],
          filters: [],
          id: existingAnnotation?.id ?? annotationID(),
          intent,
          kind: "artifact",
          observationIds: [observationId],
          rangeId,
          sectionId: null,
          strokes: [],
          text: textRef.current,
          viewId: null,
        });
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
        defaultValue={existingText}
        key={`${artifact.reference.id}:${existingAnnotation?.id ?? "new"}:${existingText}`}
        onChange={(event) => {
          const value = event.currentTarget.value;
          textRef.current = value;
          window.setTimeout(() => setText(value), 0);
        }}
        placeholder="Add context or instructions for the next agent"
      />
      <button
        disabled={
          text.trim() === "" ||
          (text.trim() === existingText &&
            intent === (existingAnnotation?.intent ?? "context"))
        }
        type="submit"
      >
        Save annotation
      </button>
      {existingAnnotation ? (
        <button onClick={() => onDelete(existingAnnotation.id)} type="button">
          Delete
        </button>
      ) : null}
    </form>
  );
}

function ArtifactDetails({
  active,
  artifact,
  observationId,
}: {
  active: boolean;
  artifact: ResolvedArtifact;
  observationId: string;
}) {
  const lens = useLens();
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
  return (
    <div
      className="lens-artifact"
      data-lens-section="artifact"
      data-timeline-active={active || undefined}
    >
      <ArtifactToolbar
        artifact={artifact}
        frame={frame}
        included={included}
        observationId={observationId}
        onToggle={() => lens.actions.toggleArtifact(artifact.reference.id)}
      />
      <div
        className={`lens-artifact-surface ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
        data-lens-artifact-id={artifact.reference.id}
      >
        <ArtifactContent artifact={artifact} />
      </div>
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
  const timed = artifacts
    .map((artifact) => ({
      artifact,
      timeline: artifactTimeline(
        lens.snapshot,
        focused.id,
        artifact.reference.id,
      ),
    }))
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        timeline: NonNullable<typeof entry.timeline>;
      } => entry.timeline !== null,
    );
  const activeArtifactId =
    lens.timeline.cursor === null || timed.length === 0
      ? (timed[0]?.artifact.reference.id ?? artifacts[0]?.reference.id ?? null)
      : timed.reduce((nearest, entry) =>
          Math.abs(entry.timeline.value - (lens.timeline.cursor ?? 0)) <
          Math.abs(nearest.timeline.value - (lens.timeline.cursor ?? 0))
            ? entry
            : nearest,
        ).artifact.reference.id;
  return (
    <div
      className={`lens-gallery ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
      data-lens-section="gallery"
      style={{
        gridTemplateColumns: `repeat(${String(definition.columns)}, minmax(220px, 1fr))`,
      }}
    >
      {artifacts.map((artifact) => (
        <ArtifactDetails
          active={artifact.reference.id === activeArtifactId}
          artifact={artifact}
          key={artifact.reference.id}
          observationId={focused.id}
        />
      ))}
    </div>
  );
}
