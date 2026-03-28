import { describe, expect, it } from "vitest";
import { buildSectionContainerDictAreaView } from "./sectionContainerDictAreaView";

describe("buildSectionContainerDictAreaView", () => {
  it("routes the dict area through the benchmark shell when the full body is disabled", () => {
    expect(
      buildSectionContainerDictAreaView({
        benchmarkActive: true,
        renderFullSectionBody: false,
        bgColor: "bg-setta-50",
        sectionId: "section-1",
      }),
    ).toEqual({
      kind: "benchmark",
      benchmarkDictAreaProps: {
        bgColor: "bg-setta-50",
        sectionId: "section-1",
      },
    });
  });

  it("routes the dict area through the live layout when benchmarking is inactive", () => {
    expect(
      buildSectionContainerDictAreaView({
        benchmarkActive: false,
        renderFullSectionBody: true,
        bgColor: "bg-transparent",
        sectionId: "section-2",
      }),
    ).toEqual({
      kind: "live",
      liveDictAreaBoundaryProps: {
        bgColor: "bg-transparent",
        sectionId: "section-2",
      },
    });
  });
});
