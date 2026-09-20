import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "@setta/workspace";
import { useEffect, useRef, useState } from "react";

import type { ResolvedArtifact } from "../backend/generatedContract";
import { useLens } from "../app/lensContext";
import {
  artifactTimeline,
  displayArtifactAtCursor,
  formatScalar,
  noteFor,
} from "../app/lensModel";

function ArtifactContent({ artifact }: { artifact: ResolvedArtifact }) {
  const [mediaError, setMediaError] = useState(false);
  useEffect(
    () => setMediaError(false),
    [artifact.reference.id, artifact.reference.sha256],
  );
  if (artifact.status === "failed") {
    return (
      <div className="lens-artifact-failure" role="alert">
        <strong>Artifact unavailable</strong>
        <span>{artifact.error.message}</span>
      </div>
    );
  }
  if (mediaError) {
    return (
      <div className="lens-artifact-failure" role="alert">
        <strong>Artifact unavailable</strong>
        <span>The admitted bytes changed or could not be loaded.</span>
      </div>
    );
  }
  switch (artifact.content.kind) {
    case "artifact":
      if (artifact.content.mediaType.startsWith("image/")) {
        return (
          <img
            alt={artifact.reference.label}
            className="lens-artifact-image"
            draggable={false}
            onError={() => setMediaError(true)}
            src={artifact.content.route}
          />
        );
      }
      if (artifact.content.mediaType.startsWith("audio/")) {
        return (
          <audio
            className="lens-artifact-media"
            controls
            onError={() => setMediaError(true)}
            preload="metadata"
            src={artifact.content.route}
          />
        );
      }
      if (artifact.content.mediaType.startsWith("video/")) {
        return (
          <video
            aria-label={artifact.reference.label}
            className="lens-artifact-media"
            controls
            onError={() => setMediaError(true)}
            preload="metadata"
            src={artifact.content.route}
          />
        );
      }
      return (
        <div className="lens-artifact-download">
          <strong>{artifact.reference.label}</strong>
          <span>{artifact.content.mediaType}</span>
          <a href={`${artifact.content.route}?download=1`}>Download artifact</a>
        </div>
      );
    case "json":
      return (
        <pre className="lens-artifact-code">
          {JSON.stringify(artifact.content.json, null, 2)}
        </pre>
      );
    case "text":
      return <pre className="lens-artifact-code">{artifact.content.text}</pre>;
    case "series":
      return (
        <p className="lens-empty">The series is shown in its linked chart.</p>
      );
  }
}

export function ArtifactSection() {
  const lens = useLens();
  const cursor = lens.timeline.cursor;
  const artifact = displayArtifactAtCursor(
    lens.snapshot,
    lens.focused?.id ?? null,
    cursor,
  );
  const artifactId = artifact?.reference.id ?? null;
  const existingNote = lens.focused
    ? noteFor(lens.selection, lens.focused.id, artifactId)
    : null;
  const [note, setNote] = useState(existingNote?.text ?? "");
  const noteRef = useRef(note);
  useEffect(() => {
    const value = existingNote?.text ?? "";
    noteRef.current = value;
    setNote(value);
  }, [existingNote?.id, existingNote?.text]);
  if (!lens.focused) {
    return (
      <p className="lens-empty">
        Select an observation to inspect its artifact.
      </p>
    );
  }
  if (!artifact) {
    return (
      <div className="lens-empty-state">
        <strong>{lens.focused.id}</strong>
        <span>No display artifact is attached to this observation.</span>
      </div>
    );
  }
  const included = lens.selection.selectedArtifactIds.includes(
    artifact.reference.id,
  );
  const frame = artifactTimeline(
    lens.snapshot,
    lens.focused.id,
    artifact.reference.id,
  );
  return (
    <div className="lens-artifact" data-lens-section="artifact">
      <div className="lens-artifact-toolbar">
        <div>
          <strong>{artifact.reference.label}</strong>
          <span>
            {frame === null
              ? lens.focused.id
              : `${frame.label} ${formatScalar(frame.value)}${frame.unit ? ` ${frame.unit}` : ""}`}
          </span>
        </div>
        <button
          aria-pressed={included}
          onClick={() => lens.actions.toggleArtifact(artifact.reference.id)}
          type="button"
        >
          {included ? "Included" : "Include artifact"}
        </button>
      </div>
      <div
        className={`lens-artifact-surface ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
        data-lens-artifact-id={artifact.reference.id}
      >
        <ArtifactContent artifact={artifact} />
      </div>
      <form
        className="lens-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          lens.actions.addNote(lens.focused!.id, artifact, noteRef.current);
        }}
      >
        <input
          key={`${artifact.reference.id}:${existingNote?.id ?? "new"}:${existingNote?.text ?? ""}`}
          aria-label="Selection note"
          defaultValue={existingNote?.text ?? ""}
          onChange={(event) => {
            const value = event.currentTarget.value;
            noteRef.current = value;
            window.setTimeout(() => setNote(value), 0);
          }}
          placeholder="Add a note for the next person or agent"
        />
        <button
          disabled={note.trim() === (existingNote?.text ?? "")}
          type="submit"
        >
          Save note
        </button>
      </form>
    </div>
  );
}
