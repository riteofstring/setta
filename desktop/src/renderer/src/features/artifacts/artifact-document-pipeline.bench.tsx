import { Renderer } from "@openuidev/react-lang";
import { renderToStaticMarkup } from "react-dom/server";
import { bench, describe } from "vitest";

import { createArtifactLibrary } from "./artifact-library";
import { projectArtifactPreview } from "./artifact-preview-projection";
import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface";
import { artifactConformanceFixtures } from "./generated/conformance-corpus";
import { createArtifactDocumentParser } from "./openui-document-parser";

/**
 * What an accepted artifact document costs on the two paths that read it.
 *
 * The rail projects a document into bounded preview blocks; the browser
 * overlay renders the whole thing through the catalog's components. Both start
 * from the same stored source and the same pinned parser, so measuring them
 * together is what says whether a preview is cheap enough to draw for every
 * artifact in the rail and whether opening one is cheap enough to feel
 * immediate.
 *
 * The documents are the corpus's own boundaries rather than invented ones: a
 * representative mixed report, and the largest source, table, and node count
 * the catalog's limits admit. Nothing here can exceed them, because the
 * backend rejects a document before it is ever stored.
 */
const parser = createArtifactDocumentParser();
const library = createArtifactLibrary();

const documents = [
  { label: "representative mixed report", source: fixtureSource("mixed_report") },
  { label: "64 KiB maximum source", source: fixtureSource("maximum_source") },
  { label: "maximum table", source: fixtureSource("maximum_table") },
  { label: "maximum statements and nodes", source: fixtureSource("maximum_statements_and_nodes") },
] as const;

for (const document of documents) {
  const previewBlocks = projectArtifactPreview(document.source);

  describe(`setta.artifacts.v1: ${document.label}`, () => {
    bench("parse", () => {
      assertCompleteParse(document.source);
    });

    // The rail's whole cost for one artifact it has read: this parses too, so
    // it is the preview path end to end rather than the projection alone.
    bench("project preview", () => {
      projectArtifactPreview(document.source);
    });

    bench("render preview", () => {
      renderToStaticMarkup(<ArtifactPreviewSurface blocks={previewBlocks} />);
    });

    // The overlay's cost. `Renderer` takes source text rather than a tree, so
    // this is a parse plus the catalog's components, which is what opening an
    // artifact actually does.
    bench("render document", () => {
      renderToStaticMarkup(<Renderer library={library} response={document.source} />);
    });
  });
}

function fixtureSource(name: string): string {
  const fixture = artifactConformanceFixtures.find((candidate) => candidate.name === name);
  if (fixture === undefined) {
    throw new Error(`artifact conformance fixture ${name} does not exist`);
  }
  return fixture.source;
}

function assertCompleteParse(source: string): void {
  const result = parser.parse(source);
  if (
    result.root === null ||
    result.meta.incomplete ||
    result.meta.errors.length > 0 ||
    result.meta.unresolved.length > 0 ||
    result.meta.orphaned.length > 0
  ) {
    throw new Error("artifact parser benchmark source did not produce one complete document");
  }
}
