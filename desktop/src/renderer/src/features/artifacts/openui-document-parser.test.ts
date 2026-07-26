import type { ElementNode } from "@openuidev/react-lang";
import { describe, expect, it } from "vitest";

import { artifactComponentNames, artifactCatalogSchema } from "./generated/artifact-catalog";
import { artifactConformanceFixtures } from "./generated/conformance-corpus";
import { createArtifactDocumentParser, toArtifactDocumentNode } from "./openui-document-parser";

// The Phase 0 gate of the OpenUI artifact system plan: every document Setta's
// Go compiler accepts has to reach the same component tree through the pinned
// upstream OpenUI parser. Both sides are independent implementations of the
// same static profile, so a disagreement here is a cutover blocker rather than
// a generator drift.
describe("setta.artifacts.v1 conformance", () => {
  const parser = createArtifactDocumentParser();

  for (const fixture of artifactConformanceFixtures) {
    it(`interprets ${fixture.name} the way Setta's compiler did`, () => {
      const result = parser.parse(fixture.source);

      expect(result.meta.errors).toEqual([]);
      expect(result.meta.incomplete).toBe(false);
      expect(result.meta.unresolved).toEqual([]);
      expect(result.meta.orphaned).toEqual([]);
      expect(result.stateDeclarations).toEqual({});
      expect(result.queryStatements).toEqual([]);
      expect(result.mutationStatements).toEqual([]);
      expect(result.root).not.toBeNull();
      expect(toArtifactDocumentNode(result.root!)).toEqual(fixture.root);
    });
  }

  it("renders every catalog component somewhere in the corpus", () => {
    const rendered = new Set<string>();
    for (const fixture of artifactConformanceFixtures) {
      const result = parser.parse(fixture.source);
      expect(result.root).not.toBeNull();
      collectComponents(toArtifactDocumentNode(result.root!), rendered);
    }
    expect([...rendered].sort()).toEqual([...artifactComponentNames].sort());
  });

  // The one interpretation difference the projection reconciles. Pinning it
  // here keeps it a known boundary rather than something the projection hides.
  it("records a skipped optional argument as null where Setta's compiler leaves it absent", () => {
    const result = parser.parse('root = Document([CodeBlock("SELECT 1", null, "Smoke query")])');

    const blocks = result.root?.props.blocks as ElementNode[];
    expect(blocks[0]?.props).toEqual({ code: "SELECT 1", language: null, caption: "Smoke query" });
    expect(toArtifactDocumentNode(blocks[0]!).props).toEqual({
      code: "SELECT 1",
      caption: "Smoke query",
    });
  });

  it("declares no schema default, so a skipped optional argument stays absent on both sides", () => {
    for (const [component, definition] of Object.entries(artifactCatalogSchema.$defs)) {
      for (const [property, schema] of Object.entries(definition.properties)) {
        expect(schema, `${component}.${property}`).not.toHaveProperty("default");
      }
    }
  });
});

function collectComponents(value: unknown, rendered: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectComponents(entry, rendered);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.component === "string" && typeof record.props === "object") {
    rendered.add(record.component);
  }
  for (const entry of Object.values(record)) {
    collectComponents(entry, rendered);
  }
}
