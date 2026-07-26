import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface";
import { artifactPreviewLimits } from "./artifact-preview-blocks";
import { projectArtifactPreview } from "./artifact-preview-projection";
import { artifactConformanceFixtures } from "./generated/conformance-corpus";

// A preview is the rail's whole account of an artifact the reader has not
// opened, so it has to say something about every document the backend accepts
// while staying bounded no matter how large that document is.
describe("setta.artifacts.v1 preview projection", () => {
  function render(source: string): string {
    return renderToStaticMarkup(<ArtifactPreviewSurface blocks={projectArtifactPreview(source)} />);
  }

  for (const fixture of artifactConformanceFixtures) {
    it(`projects ${fixture.name} within the preview bounds`, () => {
      const blocks = projectArtifactPreview(fixture.source);

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.length).toBeLessThanOrEqual(artifactPreviewLimits.maxBlocks);
      expect(blocks.filter((block) => block.kind !== "heading").length).toBeLessThanOrEqual(
        artifactPreviewLimits.maxContentBlocks,
      );
      expect(renderToStaticMarkup(<ArtifactPreviewSurface blocks={blocks} />)).not.toBe("");
    });
  }

  it("opens on content rather than on the titles above it", () => {
    const blocks = projectArtifactPreview(
      [
        'inner = Section("Detail", [Text("Two runs failed.")])',
        'outer = Section("Overview", [inner])',
        "root = Document([outer])",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "Detail" },
      { kind: "text", text: "Two runs failed.", tone: "normal" },
    ]);
  });

  it("shows a table's header and only its first rows", () => {
    const blocks = projectArtifactPreview(
      [
        'columns = [{key: "stage", label: "Stage"}, {key: "count", label: "Count"}]',
        'rows = [["Compile", "12"], ["Render", "4"], ["Publish", "1"]]',
        "root = Document([Table(columns, rows)])",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      {
        columns: ["Stage", "Count"],
        kind: "table",
        rows: [
          ["Compile", "12"],
          ["Render", "4"],
        ],
      },
    ]);
  });

  it("shows a code block's first lines only", () => {
    const blocks = projectArtifactPreview(
      'root = Document([CodeBlock("one\\ntwo\\nthree\\nfour", "go")])',
    );

    expect(blocks).toEqual([{ kind: "code", language: "go", lines: ["one", "two", "three"] }]);
  });

  it("reads a Markdown excerpt as prose rather than as source", () => {
    const blocks = projectArtifactPreview(
      'root = Document([Markdown("## Findings\\n\\n- Two runs failed\\n- One recovered")])',
    );

    expect(blocks).toEqual([
      { kind: "text", text: "Findings Two runs failed One recovered", tone: "normal" },
    ]);
  });

  // The preview must not pull the chart dependency into the command center, so
  // a chart is drawn as one static shape rather than mounted through Recharts.
  it("plots a chart's first series as one static shape", () => {
    const markup = render(
      [
        'series = [{name: "Runs", points: [{label: "Mon", value: 3}, {label: "Tue", value: 9}]}]',
        "root = Document([BarChart(series)])",
      ].join("\n"),
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain("recharts");
    expect(markup).not.toContain("<animate");
  });

  it("stops at the preview's own bounds on a maximum-size document", () => {
    const maximum = artifactConformanceFixtures.find(
      (fixture) => fixture.name === "maximum_statements_and_nodes",
    );
    expect(maximum).toBeDefined();

    const markup = renderToStaticMarkup(
      <ArtifactPreviewSurface blocks={projectArtifactPreview(maximum!.source)} />,
    );

    expect(markup.split("<").length - 1).toBeLessThan(40);
  });

  it("rejects source the compiler would never have accepted", () => {
    expect(() => projectArtifactPreview("root = Unknown()")).toThrow(
      /accepted artifact document did not parse/u,
    );
  });
});
