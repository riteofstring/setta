/**
 * The bounded shape a rail preview card renders.
 *
 * A preview is not a small artifact document: it is a fixed-size projection of
 * one, so the rail can show what an artifact contains without mounting the
 * catalog's components, the OpenUI renderer, or Recharts. The projection lives
 * in `artifact-preview-projection`, which is loaded with the parser; these
 * types and the surface that draws them carry no OpenUI code, so the rail can
 * hold them in the command center's own chunk.
 */

export type ArtifactPreviewTextTone = "normal" | "muted" | "strong";

export type ArtifactPreviewStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/** How a preview plots a chart's first series. */
export type ArtifactPreviewChartShape = "area" | "bars" | "line" | "slices";

export type ArtifactPreviewBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "text"; readonly text: string; readonly tone: ArtifactPreviewTextTone }
  | { readonly kind: "code"; readonly language: string; readonly lines: readonly string[] }
  | {
      readonly kind: "table";
      readonly columns: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly kind: "chart";
      readonly label: string;
      readonly shape: ArtifactPreviewChartShape;
      readonly values: readonly number[];
    }
  | { readonly kind: "metric"; readonly label: string; readonly value: string }
  | { readonly kind: "status"; readonly label: string; readonly tone: ArtifactPreviewStatusTone }
  | { readonly kind: "file"; readonly path: string };

/**
 * What a preview may draw, independent of the document limits the backend
 * accepts against.
 *
 * The full document's caps size what may be *stored*; these size what the rail
 * mounts for an artifact the reader has not opened. A rail holding eight
 * previews of maximum-size documents would otherwise carry eight hundred table
 * rows the reader never asked for.
 */
export const artifactPreviewLimits = {
  /** Most blocks one preview emits, including the headings that introduce them. */
  maxBlocks: 5,
  /** Most content blocks one preview emits. Headings do not count. */
  maxContentBlocks: 2,
  /** Longest text or Markdown excerpt, in characters. */
  maxExcerptCharacters: 180,
  /** Most code lines one preview shows. */
  maxCodeLines: 3,
  /** Most table columns one preview shows. */
  maxTableColumns: 4,
  /** Most table rows one preview shows, beneath the header. */
  maxTableRows: 2,
  /** Most plotted values one preview chart shows. */
  maxChartValues: 12,
  /** Longest table cell text, in characters. */
  maxCellCharacters: 32,
  /** Most document nodes one projection walks before it stops descending. */
  maxVisitedNodes: 512,
} as const;
