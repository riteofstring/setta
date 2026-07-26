import type { ElementNode } from "@openuidev/react-lang";

import {
  artifactPreviewLimits,
  type ArtifactPreviewBlock,
  type ArtifactPreviewChartShape,
} from "./artifact-preview-blocks";
import { artifactFaultText } from "./artifact-telemetry";
import type { ArtifactComponentName, ArtifactDocumentNode } from "./generated/artifact-catalog";
import type { ArtifactComponentProps } from "./generated/artifact-catalog-props";
import { createArtifactDocumentParser, toArtifactDocumentNode } from "./openui-document-parser";

/**
 * Projects one accepted artifact document onto its bounded rail preview.
 *
 * This module owns the parser, so it is the half of the preview path that has
 * to load lazily. The blocks it returns carry no OpenUI value, which is what
 * lets the rail's preview surface stay in the command center's own chunk.
 */

// One parser per renderer process. Building it compiles the generated catalog
// schema into the positional-argument map, which does not depend on the
// document being read.
let parser: ReturnType<typeof createArtifactDocumentParser> | null = null;

export function projectArtifactPreview(source: string): readonly ArtifactPreviewBlock[] {
  parser ??= createArtifactDocumentParser();
  const result = parser.parse(source);
  if (result.meta.errors.length > 0 || result.root === null) {
    throw new ArtifactPreviewParseError(result.meta.errors.map(artifactFaultText));
  }
  const walk = new ArtifactPreviewWalk();
  walk.visit(toArtifactDocumentNode(result.root));
  return walk.blocks();
}

/**
 * A parse failure on a document the backend already accepted.
 *
 * The compiler is the acceptance authority and the pinned parser agreed with it
 * on the whole conformance corpus, so reaching this is a Setta fault rather
 * than a document the reader can do anything about. It is reported as renderer
 * telemetry and shown as a generic preview failure.
 */
class ArtifactPreviewParseError extends Error {
  constructor(readonly parseErrors: readonly string[]) {
    super(`accepted artifact document did not parse: ${parseErrors.join("; ") || "no root"}`);
    this.name = "ArtifactPreviewParseError";
  }
}

/**
 * One component's props as the projected tree carries them.
 *
 * `toArtifactDocumentNode` already replaced every nested element with a
 * projected node and dropped the parser's `null`s for skipped optionals, so the
 * generated props type is right except in its component slots.
 */
type ArtifactPreviewProps<Name extends ArtifactComponentName> = {
  readonly [Key in keyof ArtifactComponentProps[Name]]: ArtifactPreviewValue<
    ArtifactComponentProps[Name][Key]
  >;
};

type ArtifactPreviewValue<Value> = Value extends ElementNode
  ? ArtifactDocumentNode
  : Value extends readonly (infer Item)[]
    ? readonly ArtifactPreviewValue<Item>[]
    : Value;

type ArtifactPreviewProjector<Name extends ArtifactComponentName> = (
  props: ArtifactPreviewProps<Name>,
  walk: ArtifactPreviewWalk,
) => void;

/**
 * Every model-visible component's preview projection.
 *
 * Keyed by the generated component-name union like the full renderer map, so a
 * catalog addition without a preview is a compile error rather than a component
 * the rail silently omits.
 */
const artifactPreviewProjectors = {
  Document: (props, walk) => walk.descend(props.blocks),
  Section: (props, walk) => {
    walk.heading(props.title);
    walk.descend(props.blocks);
  },
  Heading: (props, walk) => walk.heading(props.text),
  Text: (props, walk) => {
    walk.content({ kind: "text", text: excerpt(props.text), tone: props.tone ?? "normal" });
  },
  Markdown: (props, walk) => {
    walk.content({ kind: "text", text: markdownExcerpt(props.source), tone: "normal" });
  },
  CodeBlock: (props, walk) => {
    if (props.caption !== undefined) {
      walk.heading(props.caption);
    }
    walk.content({
      kind: "code",
      language: props.language ?? "text",
      lines: props.code.split("\n").slice(0, artifactPreviewLimits.maxCodeLines),
    });
  },
  FileReference: (props, walk) => walk.content({ kind: "file", path: props.path }),
  Stack: (props, walk) => walk.descend(props.blocks),
  Grid: (props, walk) => walk.descend(props.blocks),
  Card: (props, walk) => {
    walk.heading(props.title);
    walk.descend(props.blocks);
  },
  // A rule between blocks carries nothing a reader can read from a preview.
  Separator: () => {},
  Tabs: (props, walk) => walk.descend(props.tabs),
  Tab: (props, walk) => {
    walk.heading(props.label);
    walk.descend(props.blocks);
  },
  Accordion: (props, walk) => walk.descend(props.items),
  AccordionItem: (props, walk) => {
    walk.heading(props.label);
    walk.descend(props.blocks);
  },
  Metric: (props, walk) => {
    walk.content({ kind: "metric", label: excerpt(props.label), value: excerpt(props.value) });
  },
  Badge: (props, walk) => {
    walk.content({ kind: "status", label: excerpt(props.label), tone: props.tone ?? "neutral" });
  },
  Alert: (props, walk) => {
    walk.content({ kind: "status", label: excerpt(props.title), tone: props.tone ?? "info" });
  },
  Table: (props, walk) => {
    if (props.caption !== undefined) {
      walk.heading(props.caption);
    }
    const columns = props.columns.slice(0, artifactPreviewLimits.maxTableColumns);
    walk.content({
      kind: "table",
      columns: columns.map((column) => cellText(column.label)),
      rows: props.rows
        .slice(0, artifactPreviewLimits.maxTableRows)
        .map((row) => row.slice(0, columns.length).map(cellText)),
    });
  },
  BarChart: (props, walk) => walk.content(categoryChartBlock("bars", props.caption, props.series)),
  LineChart: (props, walk) => walk.content(categoryChartBlock("line", props.caption, props.series)),
  AreaChart: (props, walk) => walk.content(categoryChartBlock("area", props.caption, props.series)),
  PieChart: (props, walk) => {
    walk.content({
      kind: "chart",
      label: props.caption ?? "Pie chart",
      shape: "slices",
      values: props.slices
        .slice(0, artifactPreviewLimits.maxChartValues)
        .map((slice) => slice.value),
    });
  },
} satisfies { readonly [Name in ArtifactComponentName]: ArtifactPreviewProjector<Name> };

function categoryChartBlock(
  shape: Exclude<ArtifactPreviewChartShape, "slices">,
  caption: string | undefined,
  series: ArtifactPreviewProps<"BarChart">["series"],
): ArtifactPreviewBlock {
  const first = series[0];
  return {
    kind: "chart",
    label: caption ?? first?.name ?? "Chart",
    shape,
    values: (first?.points ?? [])
      .slice(0, artifactPreviewLimits.maxChartValues)
      .map((point) => point.value),
  };
}

/**
 * Walks a projected document until the preview is full.
 *
 * A heading is context for the content under it, not content itself: the most
 * recent one is held back and emitted only when a content block follows, so a
 * preview of a deeply sectioned document opens on something the reader can
 * read rather than on three nested titles.
 */
class ArtifactPreviewWalk {
  private readonly emitted: ArtifactPreviewBlock[] = [];
  private contentBlocks = 0;
  private visited = 0;
  private pendingHeading: string | null = null;

  blocks(): readonly ArtifactPreviewBlock[] {
    if (this.emitted.length === 0 && this.pendingHeading !== null) {
      this.emitted.push({ kind: "heading", text: this.pendingHeading });
    }
    return this.emitted;
  }

  heading(text: string): void {
    this.pendingHeading = excerpt(text);
  }

  content(block: ArtifactPreviewBlock): void {
    if (this.full()) {
      return;
    }
    if (this.pendingHeading !== null && this.emitted.length + 1 < artifactPreviewLimits.maxBlocks) {
      this.emitted.push({ kind: "heading", text: this.pendingHeading });
    }
    this.pendingHeading = null;
    this.emitted.push(block);
    this.contentBlocks += 1;
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
    const project = artifactPreviewProjectors[node.component] as (
      props: Record<string, unknown>,
      walk: ArtifactPreviewWalk,
    ) => void;
    project(node.props, this);
  }

  private full(): boolean {
    return (
      this.contentBlocks >= artifactPreviewLimits.maxContentBlocks ||
      this.emitted.length >= artifactPreviewLimits.maxBlocks ||
      this.visited >= artifactPreviewLimits.maxVisitedNodes
    );
  }
}

function excerpt(text: string): string {
  return truncate(text.replace(/\s+/gu, " ").trim(), artifactPreviewLimits.maxExcerptCharacters);
}

function cellText(text: string): string {
  return truncate(text.replace(/\s+/gu, " ").trim(), artifactPreviewLimits.maxCellCharacters);
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * A plain-text excerpt of Markdown source.
 *
 * The catalog's Markdown is prose with headings, lists, and inline code, and a
 * preview shows text rather than a second Markdown renderer. Each line's
 * leading block marker — an ATX heading's `#`s, a quote's `>`, a bullet's `-`,
 * `*`, or `+`, or an ordered item's `1.` — is dropped so the excerpt reads as
 * a sentence; everything else is the author's text, whitespace-collapsed.
 */
function markdownExcerpt(source: string): string {
  const text = source
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[#>]+|[-*+]|\d+\.)\s+/u, "").trim())
    .filter((line) => line.length > 0)
    .join(" ");
  return excerpt(text);
}
