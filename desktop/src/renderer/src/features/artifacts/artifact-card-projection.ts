import type { ElementNode } from "@openuidev/react-lang";

import {
  artifactCardFigureLimits,
  noArtifactCardFigures,
  type ArtifactCardFigures,
  type ArtifactSeriesShape,
} from "./artifact-card-figures";
import { artifactFaultText } from "./artifact-telemetry";
import type { ArtifactComponentName, ArtifactDocumentNode } from "./generated/artifact-catalog";
import type { ArtifactComponentProps } from "./generated/artifact-catalog-props";
import { createArtifactDocumentParser, toArtifactDocumentNode } from "./openui-document-parser";

/**
 * Finds the figures one accepted artifact document offers its rail card.
 *
 * This module owns the parser, so it is the half of the card path that has to
 * load lazily. What it returns carries no OpenUI value, which is what lets the
 * rail's figure surface stay in the command center's own chunk.
 */

// One parser per renderer process. Building it compiles the generated catalog
// schema into the positional-argument map, which does not depend on the
// document being read.
let parser: ReturnType<typeof createArtifactDocumentParser> | null = null;

export function projectArtifactCardFigures(source: string): ArtifactCardFigures {
  parser ??= createArtifactDocumentParser();
  const result = parser.parse(source);
  if (result.meta.errors.length > 0 || result.root === null) {
    throw new ArtifactCardProjectionError(result.meta.errors.map(artifactFaultText));
  }
  const walk = new ArtifactFigureWalk();
  walk.visit(toArtifactDocumentNode(result.root));
  return walk.figures();
}

/**
 * A parse failure on a document the backend already accepted.
 *
 * The compiler is the acceptance authority and the pinned parser agreed with it
 * on the whole conformance corpus, so reaching this is a Setta fault rather
 * than a document the reader can do anything about. It is reported as renderer
 * telemetry and shown as a generic card failure.
 */
class ArtifactCardProjectionError extends Error {
  constructor(readonly parseErrors: readonly string[]) {
    super(`accepted artifact document did not parse: ${parseErrors.join("; ") || "no root"}`);
    this.name = "ArtifactCardProjectionError";
  }
}

/**
 * One component's props as the projected tree carries them.
 *
 * `toArtifactDocumentNode` already replaced every nested element with a
 * projected node and dropped the parser's `null`s for skipped optionals, so the
 * generated props type is right except in its component slots.
 */
type ArtifactProjectedProps<Name extends ArtifactComponentName> = {
  readonly [Key in keyof ArtifactComponentProps[Name]]: ArtifactProjectedValue<
    ArtifactComponentProps[Name][Key]
  >;
};

type ArtifactProjectedValue<Value> = Value extends ElementNode
  ? ArtifactDocumentNode
  : Value extends readonly (infer Item)[]
    ? readonly ArtifactProjectedValue<Item>[]
    : Value;

type ArtifactFigureProjector<Name extends ArtifactComponentName> = (
  props: ArtifactProjectedProps<Name>,
  walk: ArtifactFigureWalk,
) => void;

/**
 * Every model-visible component's contribution to a card.
 *
 * Keyed by the generated component-name union like the full renderer map, so a
 * catalog addition that is silently ignored here is a deliberate entry rather
 * than an omission. Most components contribute nothing: a card does not show
 * prose, code, tables, or callouts, because the artifact's own summary says
 * what those amount to and a 300px card cannot show them honestly.
 */
const artifactFigureProjectors = {
  Document: (props, walk) => walk.descend(props.blocks),
  Section: (props, walk) => walk.descend(props.blocks),
  Stack: (props, walk) => walk.descend(props.blocks),
  Grid: (props, walk) => walk.descend(props.blocks),
  Card: (props, walk) => walk.descend(props.blocks),
  Tabs: (props, walk) => walk.descend(props.tabs),
  Tab: (props, walk) => walk.descend(props.blocks),
  Accordion: (props, walk) => walk.descend(props.items),
  AccordionItem: (props, walk) => walk.descend(props.blocks),
  Metric: (props, walk) => walk.metric(props.label, props.value),
  BarChart: (props, walk) => walk.series("bars", props.series),
  LineChart: (props, walk) => walk.series("line", props.series),
  AreaChart: (props, walk) => walk.series("area", props.series),
  PieChart: (props, walk) => {
    walk.values(
      "slices",
      props.slices.map((slice) => slice.value),
    );
  },
  Heading: () => {},
  Text: () => {},
  Markdown: () => {},
  CodeBlock: () => {},
  FileReference: () => {},
  Separator: () => {},
  Badge: () => {},
  Alert: () => {},
  Table: () => {},
} satisfies { readonly [Name in ArtifactComponentName]: ArtifactFigureProjector<Name> };

/**
 * Walks a projected document until both figures are found.
 *
 * The first of each wins: a document's opening number and opening chart are
 * the ones it leads with, and a card that showed the last of each would be
 * claiming something the document does not.
 */
class ArtifactFigureWalk {
  private metricFigure: ArtifactCardFigures["metric"] = null;
  private seriesFigure: ArtifactCardFigures["series"] = null;
  private visited = 0;

  figures(): ArtifactCardFigures {
    if (this.metricFigure === null && this.seriesFigure === null) {
      return noArtifactCardFigures;
    }
    return { metric: this.metricFigure, series: this.seriesFigure };
  }

  metric(label: string, value: string): void {
    this.metricFigure ??= { label: figureText(label), value: figureText(value) };
  }

  series(shape: ArtifactSeriesShape, series: ArtifactProjectedProps<"BarChart">["series"]): void {
    this.values(
      shape,
      (series[0]?.points ?? []).map((point) => point.value),
    );
  }

  values(shape: ArtifactSeriesShape, values: readonly number[]): void {
    if (values.length === 0) {
      return;
    }
    this.seriesFigure ??= {
      shape,
      values: values.slice(0, artifactCardFigureLimits.maxSeriesValues),
    };
  }

  descend(nodes: readonly ArtifactDocumentNode[]): void {
    for (const node of nodes) {
      if (this.full()) {
        return;
      }
      this.visit(node);
    }
  }

  visit(node: ArtifactDocumentNode): void {
    this.visited += 1;
    // Every projector is typed against its own component's props, but one
    // picked out of the map by name is a union of all of them, which no
    // signature can correlate. The map itself is what holds a projector to its
    // component.
    const project = artifactFigureProjectors[node.component] as (
      props: Record<string, unknown>,
      walk: ArtifactFigureWalk,
    ) => void;
    project(node.props, this);
  }

  private full(): boolean {
    return (
      (this.metricFigure !== null && this.seriesFigure !== null) ||
      this.visited >= artifactCardFigureLimits.maxVisitedNodes
    );
  }
}

function figureText(text: string): string {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  return collapsed.length <= artifactCardFigureLimits.maxFigureCharacters
    ? collapsed
    : `${collapsed.slice(0, artifactCardFigureLimits.maxFigureCharacters - 1).trimEnd()}…`;
}
