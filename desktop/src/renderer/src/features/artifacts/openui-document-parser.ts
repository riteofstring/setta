import { createParser, type ElementNode } from "@openuidev/react-lang";

import {
  artifactCatalogId,
  artifactCatalogRootComponent,
  artifactCatalogSchema,
  artifactComponentNames,
  type ArtifactComponentName,
  type ArtifactDocumentNode,
} from "./generated/artifact-catalog";

/**
 * Reads a stored artifact document with the pinned upstream OpenUI parser.
 *
 * Setta's backend is the only acceptance authority: a document reaches this
 * parser only after the Go compiler validated its grammar, catalog contract,
 * values, safety rules, and limits. What the parser adds is the shared
 * interpretation of an accepted document, which is why the generated catalog
 * schema it compiles is rendered from the same Go catalog.
 */
export type ArtifactDocumentParser = ReturnType<typeof createParser>;

export function createArtifactDocumentParser(): ArtifactDocumentParser {
  return createParser(artifactCatalogSchema, artifactCatalogRootComponent);
}

const catalogComponents = new Set<string>(artifactComponentNames);

/**
 * Projects an upstream parse tree onto Setta's compiled-document shape.
 *
 * Two deliberate differences are reconciled here:
 *
 *   - `type`, `statementId`, `partial`, and `hasDynamicProps` are the parser's
 *     streaming and reference bookkeeping, not document content
 *   - a skipped optional argument is absent in Setta's compiled tree and
 *     present as `null` in the parser's, so null-valued entries are dropped;
 *     no catalog value may legitimately be null
 */
export function toArtifactDocumentNode(node: ElementNode): ArtifactDocumentNode {
  return { component: toComponentName(node.typeName), props: toDocumentProps(node.props) };
}

function toComponentName(typeName: string): ArtifactComponentName {
  if (!catalogComponents.has(typeName)) {
    throw new Error(
      `artifact document rendered ${typeName}, which catalog ${artifactCatalogId} does not register`,
    );
  }
  return typeName as ArtifactComponentName;
}

function toDocumentProps(props: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (value === null) {
      continue;
    }
    projected[name] = toDocumentValue(value);
  }
  return projected;
}

function toDocumentValue(value: unknown): unknown {
  if (isElementNode(value)) {
    return toArtifactDocumentNode(value);
  }
  if (Array.isArray(value)) {
    return value.map(toDocumentValue);
  }
  if (typeof value === "object" && value !== null) {
    return toDocumentProps(value as Record<string, unknown>);
  }
  return value;
}

function isElementNode(value: unknown): value is ElementNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ElementNode>;
  return candidate.type === "element" && typeof candidate.typeName === "string";
}
