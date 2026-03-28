import { describe, expect, it } from "vitest";
import { buildSectionContainerAreaDictView } from "./sectionContainerAreaDictView";

describe("buildSectionContainerAreaDictView", () => {
  it("routes the dict area through the benchmark shell when the full body is disabled", () => {
    expect(
      buildSectionContainerAreaDictView({
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
      buildSectionContainerAreaDictView({
        benchmarkActive: false,
        renderFullSectionBody: true,
        bgColor: "bg-transparent",
        sectionId: "section-2",
      }),
    ).toEqual({
      kind: "live",
      liveSectionContainerDictAreaProps: {
        bgColor: "bg-transparent",
        sectionId: "section-2",
      },
    });
  });
});
