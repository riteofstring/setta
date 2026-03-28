import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildBenchmarkParamRows,
  buildLiveDictAreaLayoutView,
  resolveDictAreaRenderMode,
} from "./dictAreaView";

describe("dictAreaView", () => {
  it("uses the live DictArea path when the benchmark is inactive", () => {
    expect(
      resolveDictAreaRenderMode({
        benchmarkActive: false,
        renderFullSectionBody: false,
      }),
    ).toBe("live");
  });

  it("uses the live DictArea path when the benchmark renders the full section body", () => {
    expect(
      resolveDictAreaRenderMode({
        benchmarkActive: true,
        renderFullSectionBody: true,
      }),
    ).toBe("live");
  });

  it("uses the benchmark DictArea path when the benchmark replaces the full section body", () => {
    expect(
      resolveDictAreaRenderMode({
        benchmarkActive: true,
        renderFullSectionBody: false,
      }),
    ).toBe("benchmark");
  });

  it("builds benchmark param rows from the flattened tree items", () => {
    expect(
      buildBenchmarkParamRows({
        items: [
          { depth: 0, id: "group-1", isParent: true },
          { depth: 1, id: "param-1", isParent: false },
        ],
        getLabel: (id) => `${id}-label`,
      }),
    ).toEqual([
      {
        depth: 0,
        id: "group-1",
        isParent: true,
        label: "group-1-label",
      },
      {
        depth: 1,
        id: "param-1",
        isParent: false,
        label: "param-1-label",
      },
    ]);
  });

  it("builds the live DictArea layout props above the GroupContainer wrapper", () => {
    expect(
      buildLiveDictAreaLayoutView({
        bgColor: "bg-transparent",
        sectionId: "section-1",
      }),
    ).toEqual({
      kwargsControlsProps: {
        sectionId: "section-1",
      },
      paramGroupContainerProps: {
        bgColor: "bg-transparent",
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
      },
    });
  });
});
