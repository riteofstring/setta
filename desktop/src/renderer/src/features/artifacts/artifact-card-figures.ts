/**
 * What a rail card shows of the document it opens.
 *
 * A card is a claim about an artifact, not a small window onto it. Its words
 * come from the artifact's own title, kind, and summary — all three authored
 * for exactly this purpose — so the only thing a card needs from inside the
 * document is the evidence: the headline number, and the shape of the series
 * behind it.
 *
 * That is the whole projection. It carries no OpenUI value, so the rail draws
 * it without the catalog's components, the OpenUI renderer, or Recharts; and
 * it is small enough that a rail of eight cards holds eight figures rather
 * than eight bounded replays of eight documents.
 */

/** How a card plots a chart's first series. */
export type ArtifactSeriesShape = "area" | "bars" | "line" | "slices";

export type ArtifactCardFigures = {
  /** The document's first metric: the number a glance is worth. */
  readonly metric: { readonly label: string; readonly value: string } | null;
  /** The document's first chart, as one unlabelled sparkline. */
  readonly series: {
    readonly shape: ArtifactSeriesShape;
    readonly values: readonly number[];
  } | null;
};

export const artifactCardFigureLimits = {
  /** Longest metric label or value, in characters. */
  maxFigureCharacters: 48,
  /** Most plotted values one sparkline shows. */
  maxSeriesValues: 12,
  /** Most document nodes one projection walks before it stops descending. */
  maxVisitedNodes: 512,
} as const;

export const noArtifactCardFigures: ArtifactCardFigures = { metric: null, series: null };
