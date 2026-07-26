import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactCardFigureView } from "./ArtifactCardFigures";
import { artifactCardFigureLimits } from "./artifact-card-figures";
import { projectArtifactCardFigures } from "./artifact-card-projection";
import { artifactConformanceFixtures } from "./generated/conformance-corpus";

// A card's words come from the artifact's own title, kind, and summary. What
// the projection owes it is the evidence inside the document — and a bound on
// how much of any document it will walk to find it.
describe("setta.artifacts.v1 card projection", () => {
  function render(source: string): string {
    return renderToStaticMarkup(
      <ArtifactCardFigureView figures={projectArtifactCardFigures(source)} />,
    );
  }

  for (const fixture of artifactConformanceFixtures) {
    it(`projects ${fixture.name} within the card's bounds`, () => {
      const figures = projectArtifactCardFigures(fixture.source);

      expect(figures.metric?.label.length ?? 0).toBeLessThanOrEqual(
        artifactCardFigureLimits.maxFigureCharacters,
      );
      expect(figures.metric?.value.length ?? 0).toBeLessThanOrEqual(
        artifactCardFigureLimits.maxFigureCharacters,
      );
      expect(figures.series?.values.length ?? 0).toBeLessThanOrEqual(
        artifactCardFigureLimits.maxSeriesValues,
      );
    });
  }

  it("takes the document's first number and first series, wherever they are nested", () => {
    const figures = projectArtifactCardFigures(
      [
        'series = [{name: "Runs", points: [{label: "Mon", value: 3}, {label: "Tue", value: 9}]}]',
        'inner = Section("Detail", [Metric("Deep work", "52 min"), BarChart(series)])',
        'outer = Section("Overview", [Text("Two runs failed."), inner])',
        'root = Document([outer, Metric("Ignored", "0")])',
      ].join("\n"),
    );

    expect(figures).toEqual({
      metric: { label: "Deep work", value: "52 min" },
      series: { shape: "bars", values: [3, 9] },
    });
  });

  // A card is a claim, not a window: prose, tables, code, and callouts are the
  // document's job, and the artifact's own summary is what stands in for them.
  it("takes nothing from prose, tables, code, or callouts", () => {
    const figures = projectArtifactCardFigures(
      [
        'columns = [{key: "stage", label: "Stage"}]',
        'table = Table(columns, [["Compile"]])',
        'root = Document([Text("Two runs failed."), table, CodeBlock("one", "go"), Alert("Stop", "Now")])',
      ].join("\n"),
    );

    expect(figures).toEqual({ metric: null, series: null });
    expect(renderToStaticMarkup(<ArtifactCardFigureView figures={figures} />)).toBe("");
  });

  // The card must not pull the chart dependency into the command center, so a
  // series is drawn as one static shape rather than mounted through Recharts.
  it("plots a series as one static shape", () => {
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

  it("plots negative and positive bars around the zero baseline", () => {
    const markup = render(
      [
        'series = [{name: "Change", points: [{label: "Mon", value: -3}, {label: "Tue", value: 3}]}]',
        "root = Document([BarChart(series)])",
      ].join("\n"),
    );

    expect(markup.match(/height="11"/gu)).toHaveLength(2);
    expect(markup.match(/y="11"/gu)).toHaveLength(1);
    expect(markup.match(/y="0"/gu)).toHaveLength(1);
  });

  it("stays small on a maximum-size document", () => {
    const maximum = artifactConformanceFixtures.find(
      (fixture) => fixture.name === "maximum_statements_and_nodes",
    );
    expect(maximum).toBeDefined();

    const markup = render(maximum!.source);

    expect(markup.split("<").length - 1).toBeLessThan(40);
  });

  it("rejects source the compiler would never have accepted", () => {
    expect(() => projectArtifactCardFigures("root = Unknown()")).toThrow(
      /accepted artifact document did not parse/u,
    );
  });
});
