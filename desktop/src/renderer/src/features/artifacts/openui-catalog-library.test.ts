import { createLibrary, createParser, defineComponent } from "@openuidev/react-lang";
import { describe, expect, it } from "vitest";

import { artifactCatalogRootComponent, artifactCatalogSchema } from "./generated/artifact-catalog";
import { artifactComponentPropsSchemas } from "./generated/artifact-catalog-props";
import { artifactCatalogSignatures } from "./generated/artifact-catalog-signatures";
import { artifactConformanceFixtures } from "./generated/conformance-corpus";
import { toArtifactDocumentNode } from "./openui-document-parser";

// The catalog reaches the pinned upstream parser twice: through the JSON
// Schema Setta renders from Go, and through the Zod props schemas OpenUI
// compiles a library from. Both decide the same positional-argument map, so a
// disagreement silently maps a model's arguments onto the wrong props. This
// suite holds the two halves, and the model-facing text sent with them, to one
// argument order.
describe("setta.artifacts.v1 catalog library", () => {
  const library = createLibrary({
    components: artifactCatalogSignatures.map((signature) =>
      defineComponent({
        name: signature.component,
        props: artifactComponentPropsSchemas[signature.component],
        description: signature.summary,
        // The renderers are Setta's, not the catalog's. The library only needs
        // a component here to define one, and nothing in this suite renders.
        component: () => null,
      }),
    ),
    root: artifactCatalogRootComponent,
  });
  const librarySchema = library.toJSONSchema();
  const libraryDefinitions = librarySchema.$defs ?? {};

  it("registers exactly the catalog's components", () => {
    expect(Object.keys(libraryDefinitions).sort()).toEqual(
      Object.keys(artifactCatalogSchema.$defs).sort(),
    );
  });

  for (const signature of artifactCatalogSignatures) {
    it(`maps ${signature.component} arguments the way the catalog schema does`, () => {
      const fromZod = libraryDefinitions[signature.component];
      const fromGo = artifactCatalogSchema.$defs[signature.component];
      const advertised = signature.properties.map((property) => property.name);

      expect(Object.keys(fromZod?.properties ?? {})).toEqual(Object.keys(fromGo.properties));
      expect(Object.keys(fromZod?.properties ?? {})).toEqual(advertised);
      expect(signature.summary).toBe(fromGo.description);
      expect([...(fromZod?.required ?? [])].sort()).toEqual([...fromGo.required].sort());
      expect([...(fromZod?.required ?? [])].sort()).toEqual(
        signature.properties
          .filter((property) => property.required)
          .map((property) => property.name)
          .sort(),
      );
      for (const property of signature.properties) {
        expect(property.description).toBe(
          (fromGo.properties[property.name] as { description?: string }).description,
        );
      }
    });
  }

  // A declared default is substituted by the parser where Setta's compiler
  // leaves a skipped optional argument absent, so neither half may carry one.
  it("declares no schema default on either half", () => {
    for (const [component, definition] of Object.entries(libraryDefinitions)) {
      for (const [property, schema] of Object.entries(definition.properties ?? {})) {
        expect(schema, `${component}.${property}`).not.toHaveProperty("default");
      }
    }
  });

  // The structural checks above compare declarations. This one compares
  // behaviour: a parser built from the library has to read the accepted corpus
  // into the same trees as the parser built from the Go-rendered schema.
  describe("parses the accepted corpus identically", () => {
    const parser = createParser(librarySchema, artifactCatalogRootComponent);

    for (const fixture of artifactConformanceFixtures) {
      it(`reads ${fixture.name} into Setta's compiled tree`, () => {
        const result = parser.parse(fixture.source);

        expect(result.meta.errors).toEqual([]);
        expect(result.meta.incomplete).toBe(false);
        expect(result.root).not.toBeNull();
        expect(toArtifactDocumentNode(result.root!)).toEqual(fixture.root);
      });
    }
  });
});
