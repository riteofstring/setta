import { Renderer } from "@openuidev/react-lang";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createArtifactLibrary } from "./artifact-library";
import { artifactRenderers } from "./artifact-renderers";
import { artifactComponentNames } from "./generated/artifact-catalog";
import { artifactConformanceFixtures } from "./generated/conformance-corpus";

// The renderer map is the last hop of the catalog contract: the backend accepts
// a document, the pinned parser reads it into the tree Setta compiled, and this
// map turns that tree into official shadcn Base UI and Setta components. These
// render through the production library, so a renderer that throws on a
// document the backend would accept fails here — server rendering has no error
// boundary to swallow it.
describe("setta.artifacts.v1 renderer map", () => {
  const library = createArtifactLibrary();

  function render(source: string): string {
    return renderToStaticMarkup(<Renderer library={library} response={source} />);
  }

  it("registers a renderer for every catalog component", () => {
    expect(Object.keys(artifactRenderers).sort()).toEqual([...artifactComponentNames].sort());
    expect(Object.keys(library.components).sort()).toEqual([...artifactComponentNames].sort());
  });

  // The accepted corpus renders every model-visible component and every limit
  // boundary the catalog allows, so this is the map's coverage of the catalog
  // in practice rather than only in the type system.
  for (const fixture of artifactConformanceFixtures) {
    it(`renders ${fixture.name}`, () => {
      expect(render(fixture.source)).not.toBe("");
    });
  }

  it("renders a table's cells in column order and honours column alignment", () => {
    const markup = render(
      [
        'table = Table([{key: "stage", label: "Stage"}, {key: "count", label: "Count", align: "end"}], [["Compile", "12"], ["Render", "4"]], "Runs by stage")',
        "root = Document([table])",
      ].join("\n"),
    );

    expect(markup).toContain("Runs by stage");
    expect(markup.indexOf("Compile")).toBeLessThan(markup.indexOf("Render"));
    expect(markup).toContain("text-end tabular-nums");
    expect(markup).toContain('scope="col"');
    expect(markup).toContain("select-text");
  });

  it("renders each tab's label and the first tab's content", () => {
    const markup = render(
      [
        'summary = Tab("Summary", [Text("Two runs failed.")])',
        'detail = Tab("Detail", [Text("Both failed while compiling.")])',
        "root = Document([Tabs([summary, detail])])",
      ].join("\n"),
    );

    expect(markup).toContain("Summary");
    expect(markup).toContain("Detail");
    expect(markup).toContain("Two runs failed.");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("focus-visible:outline-2");
  });

  it("renders every accordion item's label", () => {
    const markup = render(
      [
        'first = AccordionItem("Failed runs", [Text("Two runs failed.")])',
        'second = AccordionItem("Queued runs", [Text("One run is queued.")])',
        "root = Document([Accordion([first, second])])",
      ].join("\n"),
    );

    expect(markup).toContain("Failed runs");
    expect(markup).toContain("Queued runs");
  });

  // Recharts measures its container before drawing, so server rendering stops
  // at the chart surface. What it does settle is the part Setta owns: one
  // palette entry per series, published as the custom properties the plot reads
  // its colours from, under both colour modes.
  it("gives each chart series its own palette entry in both colour modes", () => {
    const markup = render(
      [
        'compile = {name: "Compile", points: [{label: "Mon", value: 4}, {label: "Tue", value: 6}]}',
        'render = {name: "Render", points: [{label: "Mon", value: 2}, {label: "Tue", value: 9}]}',
        'root = Document([LineChart([compile, render], "Runs per day")])',
      ].join("\n"),
    );

    expect(markup).toContain('data-slot="chart"');
    expect(markup).toContain("Runs per day");
    expect(markup).toContain("--color-series-0: var(--accent-cyan)");
    expect(markup).toContain("--color-series-1: var(--accent-violet)");
    expect(markup).toContain(':root:not([data-color-mode="light"])');
    expect(markup).toContain("recharts-surface:focus-visible");
  });

  it("gives a pie slice a colour from the artifact palette", () => {
    const markup = render(
      'root = Document([PieChart([{label: "Passed", value: 12}, {label: "Failed", value: 3}])])',
    );

    expect(markup).toContain("--color-slice-0");
    expect(markup).toContain("var(--accent-cyan)");
  });

  it("renders Markdown structure without raw markup", () => {
    const markup = render(
      'root = Document([Markdown("# Findings\\n\\n- one `flaky` test\\n- two slow runs")])',
    );

    expect(markup).toContain("<h2");
    expect(markup).not.toContain("<h1");
    expect(markup).toContain("<li>");
    expect(markup).toContain("<code>flaky</code>");
  });

  it("renders a code block verbatim beside its language", () => {
    const markup = render(
      'root = Document([CodeBlock("go test ./internal/...", "bash", "Reproduce with")])',
    );

    expect(markup).toContain("Reproduce with");
    expect(markup).toContain("bash");
    expect(markup).toContain("go test ./internal/...");
  });

  it("renders a file reference as inert text rather than a link", () => {
    const markup = render(
      'root = Document([FileReference("internal/conversation/domain.go", "The artifact contract")])',
    );

    expect(markup).toContain("internal/conversation/domain.go");
    expect(markup).toContain("The artifact contract");
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("file://");
  });

  it("renders status tones with readable text and non-colour semantics", () => {
    const markup = render(
      [
        'root = Document([Badge("Blocked", "danger"), Alert("Two runs failed", "Both failed while compiling.", "warning"), Metric("Failed runs", "2", null, "negative")])',
      ].join("\n"),
    );

    expect(markup).toContain('data-tone="danger"');
    expect(markup).toContain('data-tone="warning"');
    expect(markup).toContain('data-tone="negative"');
    expect(markup).toContain("border-status-critical/40");
    expect(markup).toContain("border-status-warning/40");
    expect(markup).toContain("text-card-foreground");
    expect(markup).toContain('<span class="sr-only">Danger: </span>Blocked');
    expect(markup).toContain('<span class="sr-only">Warning: </span>Two runs failed');
    expect(markup).toContain('<span class="sr-only">Negative: </span>2');
    expect(markup).toContain("<dl");
    expect(markup).toContain("<dt");
    expect(markup).toContain("<dd");
    expect(markup).toContain("Both failed while compiling.");
  });
});
