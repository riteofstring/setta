import { bench, describe } from "vitest";

import { artifactConformanceFixtures } from "./generated/conformance-corpus";
import { createArtifactDocumentParser } from "./openui-document-parser";

const parser = createArtifactDocumentParser();

const representativeSource = fixtureSource("mixed_report");
const maximumSource = fixtureSource("maximum_source");

describe("setta.artifacts.v1 parser cost", () => {
  bench("representative document", () => {
    assertCompleteParse(representativeSource);
  });

  bench("64 KiB maximum source", () => {
    assertCompleteParse(maximumSource);
  });
});

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
