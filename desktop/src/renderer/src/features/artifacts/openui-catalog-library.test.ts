import { createLibrary, createParser, defineComponent } from "@openuidev/react-lang";
import { describe, expect, it } from "vitest";

import {
  artifactCatalogRootComponent,
  artifactCatalogSchema,
  type ArtifactComponentSchema,
} from "./generated/artifact-catalog";
import { artifactComponentPropsSchemas } from "./generated/artifact-catalog-props";
import {
  artifactCatalogSignatures,
  type ArtifactCatalogSignature,
} from "./generated/artifact-catalog-signatures";
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
      assertCatalogSignatureMapping(
        signature,
        libraryDefinitions[signature.component],
        artifactCatalogSchema.$defs[signature.component],
      );
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

interface LibraryComponentDefinition {
  readonly properties?: Record<string, unknown>;
  readonly required?: string[];
}

function assertCatalogSignatureMapping(
  signature: ArtifactCatalogSignature,
  fromZod: LibraryComponentDefinition | undefined,
  fromGo: ArtifactComponentSchema,
): void {
  const zodProperties = libraryDefinitionProperties(fromZod);
  const zodRequired = libraryDefinitionRequired(fromZod);
  const advertised = signature.properties.map((property) => property.name);
  const advertisedRequired = signature.properties
    .filter((property) => property.required)
    .map((property) => property.name)
    .sort();

  expect(Object.keys(zodProperties)).toEqual(Object.keys(fromGo.properties));
  expect(Object.keys(zodProperties)).toEqual(advertised);
  expect(signature.summary).toBe(fromGo.description);
  expect([...zodRequired].sort()).toEqual([...fromGo.required].sort());
  expect([...zodRequired].sort()).toEqual(advertisedRequired);
  for (const property of signature.properties) {
    expect(property.description).toBe(
      (fromGo.properties[property.name] as { description?: string }).description,
    );
  }
}

function libraryDefinitionProperties(
  definition: LibraryComponentDefinition | undefined,
): Record<string, unknown> {
  return definition?.properties ?? {};
}

function libraryDefinitionRequired(
  definition: LibraryComponentDefinition | undefined,
): readonly string[] {
  return definition?.required ?? [];
}
