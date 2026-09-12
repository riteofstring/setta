import { useEffect, useId, useState } from "react";
import {
  type WorkspaceSectionData,
  useWorkspaceCapabilities,
  useWorkspaceHost,
} from "@setta/workspace";

import {
  DRAWING_CANVAS_MAX_SIZE,
  DRAWING_CANVAS_MIN_SIZE,
  type DrawingCanvasAnchor,
} from "./drawingRuntime";
import {
  fitDrawingSectionToCanvas,
  getDrawingCanvasSize,
  resizeDrawingCanvas,
} from "./drawingSurfaceRegistry";
import { readDrawingSectionData } from "./sectionData";

type DrawingInspectorProps = {
  data: unknown;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  sectionId: string;
};

type CanvasSize = {
  height: number;
  width: number;
};

type Feedback =
  | { kind: "error"; message: string }
  | { kind: "status"; message: string }
  | null;

const CANVAS_ANCHORS: Array<{
  label: string;
  value: DrawingCanvasAnchor;
}> = [
  { label: "Top left anchor", value: "top-left" },
  { label: "Top anchor", value: "top" },
  { label: "Top right anchor", value: "top-right" },
  { label: "Left anchor", value: "left" },
  { label: "Center anchor", value: "center" },
  { label: "Right anchor", value: "right" },
  { label: "Bottom left anchor", value: "bottom-left" },
  { label: "Bottom anchor", value: "bottom" },
  { label: "Bottom right anchor", value: "bottom-right" },
];

function readCanvasDimension(value: string): number | null {
  const dimension = Number(value);
  return Number.isInteger(dimension) &&
    dimension >= DRAWING_CANVAS_MIN_SIZE &&
    dimension <= DRAWING_CANVAS_MAX_SIZE
    ? dimension
    : null;
}

function linkedDimension(value: string, ratio: number): string | null {
  const dimension = Number(value);
  if (!Number.isFinite(dimension) || dimension <= 0) {
    return null;
  }
  return String(Math.round(dimension * ratio));
}

export function DrawingInspector({
  data,
  isMinimized,
  positionAndSizeLocked,
  sectionId,
}: DrawingInspectorProps) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities(
    (capabilities) => capabilities.canEditLayout,
  );
  const persisted = readDrawingSectionData(
    data as WorkspaceSectionData | undefined,
  );
  const initialSize = getDrawingCanvasSize(host, sectionId) ?? {
    height: persisted.height,
    width: persisted.width,
  };
  const [anchor, setAnchor] = useState<DrawingCanvasAnchor>("center");
  const [baseline, setBaseline] = useState<CanvasSize>(initialSize);
  const [constrainProportions, setConstrainProportions] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [heightDraft, setHeightDraft] = useState(String(initialSize.height));
  const [mode, setMode] = useState<"keep-artwork" | "scale-artwork">(
    "keep-artwork",
  );
  const [widthDraft, setWidthDraft] = useState(String(initialSize.width));
  const descriptionId = useId();
  const feedbackId = useId();

  useEffect(() => {
    const size = getDrawingCanvasSize(host, sectionId) ?? {
      height: persisted.height,
      width: persisted.width,
    };
    setBaseline(size);
    setHeightDraft(String(size.height));
    setWidthDraft(String(size.width));
    setFeedback(null);
  }, [host, persisted.height, persisted.width, sectionId]);

  function changeWidth(value: string): void {
    setWidthDraft(value);
    setFeedback(null);
    if (!constrainProportions) {
      return;
    }
    const nextHeight = linkedDimension(value, baseline.height / baseline.width);
    if (nextHeight !== null) {
      setHeightDraft(nextHeight);
    }
  }

  function changeHeight(value: string): void {
    setHeightDraft(value);
    setFeedback(null);
    if (!constrainProportions) {
      return;
    }
    const nextWidth = linkedDimension(value, baseline.width / baseline.height);
    if (nextWidth !== null) {
      setWidthDraft(nextWidth);
    }
  }

  function applyCanvasSize(): void {
    const width = readCanvasDimension(widthDraft);
    const height = readCanvasDimension(heightDraft);
    if (width === null || height === null) {
      setFeedback({
        kind: "error",
        message: `Canvas width and height must be whole numbers between ${DRAWING_CANVAS_MIN_SIZE} and ${DRAWING_CANVAS_MAX_SIZE}.`,
      });
      return;
    }
    const current = getDrawingCanvasSize(host, sectionId) ?? baseline;
    if (current.width === width && current.height === height) {
      setFeedback({ kind: "status", message: "Canvas size is unchanged." });
      return;
    }
    if (
      !resizeDrawingCanvas(host, sectionId, {
        anchor,
        height,
        mode,
        width,
      })
    ) {
      setFeedback({
        kind: "error",
        message:
          "Expand the section and wait for the drawing to finish loading.",
      });
      return;
    }
    const nextSize = { height, width };
    setBaseline(nextSize);
    setHeightDraft(String(height));
    setWidthDraft(String(width));
    setFeedback({
      kind: "status",
      message: `Canvas resized to ${width} by ${height} pixels.`,
    });
  }

  function fitFrameToCanvas(): void {
    if (!fitDrawingSectionToCanvas(host, sectionId)) {
      setFeedback({
        kind: "error",
        message:
          "Expand the section and wait for the drawing to finish loading.",
      });
      return;
    }
    setFeedback({ kind: "status", message: "Section fitted to the canvas." });
  }

  const hasError = feedback?.kind === "error";
  const fitDisabled = isMinimized || positionAndSizeLocked || !canEditLayout;

  return (
    <section
      aria-describedby={descriptionId}
      className="realtime-drawing-inspector"
    >
      <div className="realtime-drawing-inspector-heading">
        <h4>Drawing canvas</h4>
        <span>
          {baseline.width} × {baseline.height} px
        </span>
      </div>
      <p id={descriptionId}>
        Resize the drawing surface independently from its section frame.
      </p>
      <div className="realtime-drawing-inspector-dimensions">
        <label>
          <span>Width</span>
          <div className="realtime-drawing-inspector-dimension">
            <input
              aria-describedby={hasError ? feedbackId : undefined}
              aria-invalid={hasError || undefined}
              aria-label="Canvas width"
              className="setta-workspace-inspector-input"
              inputMode="numeric"
              max={DRAWING_CANVAS_MAX_SIZE}
              min={DRAWING_CANVAS_MIN_SIZE}
              onChange={(event) => changeWidth(event.currentTarget.value)}
              step={1}
              type="number"
              value={widthDraft}
            />
            <span>px</span>
          </div>
        </label>
        <label>
          <span>Height</span>
          <div className="realtime-drawing-inspector-dimension">
            <input
              aria-describedby={hasError ? feedbackId : undefined}
              aria-invalid={hasError || undefined}
              aria-label="Canvas height"
              className="setta-workspace-inspector-input"
              inputMode="numeric"
              max={DRAWING_CANVAS_MAX_SIZE}
              min={DRAWING_CANVAS_MIN_SIZE}
              onChange={(event) => changeHeight(event.currentTarget.value)}
              step={1}
              type="number"
              value={heightDraft}
            />
            <span>px</span>
          </div>
        </label>
      </div>
      <label className="realtime-drawing-inspector-checkbox">
        <input
          checked={constrainProportions}
          onChange={(event) =>
            setConstrainProportions(event.currentTarget.checked)
          }
          type="checkbox"
        />
        <span>Constrain proportions</span>
      </label>
      <label className="realtime-drawing-inspector-field">
        <span>Artwork behavior</span>
        <select
          aria-label="Artwork behavior"
          className="setta-workspace-inspector-input"
          onChange={(event) => {
            setMode(
              event.currentTarget.value === "scale-artwork"
                ? "scale-artwork"
                : "keep-artwork",
            );
            setFeedback(null);
          }}
          value={mode}
        >
          <option value="keep-artwork">Keep artwork size</option>
          <option value="scale-artwork">Scale artwork to fit</option>
        </select>
      </label>
      <fieldset
        className="realtime-drawing-inspector-anchor"
        disabled={mode === "scale-artwork"}
      >
        <legend>Anchor</legend>
        <div>
          {CANVAS_ANCHORS.map((candidate) => (
            <button
              aria-label={candidate.label}
              aria-pressed={anchor === candidate.value}
              key={candidate.value}
              onClick={() => {
                setAnchor(candidate.value);
                setFeedback(null);
              }}
              title={candidate.label}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
      <p className="realtime-drawing-inspector-help">
        {mode === "keep-artwork"
          ? "The anchor chooses where existing artwork stays when bounds change."
          : "Artwork positions and dimensions scale with the canvas."}
      </p>
      <div className="realtime-drawing-inspector-actions">
        <button
          data-apply-canvas-size
          disabled={isMinimized}
          onClick={applyCanvasSize}
          type="button"
        >
          Apply canvas size
        </button>
        <button
          data-fit-frame-to-canvas
          disabled={fitDisabled}
          onClick={fitFrameToCanvas}
          type="button"
        >
          Fit frame to canvas
        </button>
      </div>
      {feedback === null ? null : (
        <p
          className={`realtime-drawing-inspector-feedback realtime-drawing-inspector-feedback-${feedback.kind}`}
          id={feedbackId}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}
