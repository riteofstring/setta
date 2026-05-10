import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  type CodeObjType,
  type SectionType,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS,
  getGpuFlowCompatibilityFixturePlan,
} from "./gpuFlowCompatibilityFixture";

function sorted<T extends string>(values: readonly T[]): T[] {
  return [...values].sort();
}

describe("gpuFlowCompatibilityFixture", () => {
  it("builds one representative section fixture per generated section type", () => {
    const plan = getGpuFlowCompatibilityFixturePlan();

    expect(
      sorted(plan.sectionFixtures.map((fixture) => fixture.sectionType)),
    ).toEqual(sorted(Object.values(SectionTypeEnum) as SectionType[]));
    expect(
      new Set(plan.sectionFixtures.map((fixture) => fixture.fixtureId)).size,
    ).toBe(plan.sectionFixtures.length);
    for (const fixture of plan.sectionFixtures) {
      expect(fixture.fixtureId).toBe(`section:${fixture.sectionType}`);
      expect(fixture.display.length).toBeGreaterThan(0);
      expect(fixture.nativeInteractions.length).toBeGreaterThan(0);
      expect(fixture.canvasInteractions).toEqual([
        "scroll-pan",
        "click-pan",
        "direct-move",
        "resize",
        "selection",
        "dnd",
        "edge-interaction",
      ]);
      expect(fixture.zoomLevels).toEqual(GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS);
    }
  });

  it("builds one representative param fixture per generated code object type", () => {
    const plan = getGpuFlowCompatibilityFixturePlan();

    expect(
      sorted(plan.paramFixtures.map((fixture) => fixture.codeObjType)),
    ).toEqual(sorted(Object.values(CodeObjTypeEnum) as CodeObjType[]));
    expect(
      new Set(plan.paramFixtures.map((fixture) => fixture.fixtureId)).size,
    ).toBe(plan.paramFixtures.length);
    for (const fixture of plan.paramFixtures) {
      expect(fixture.fixtureId).toBe(`param:${fixture.codeObjType}`);
      expect(fixture.firstInteraction.length).toBeGreaterThan(0);
      expect(fixture.surfaces.length).toBeGreaterThan(0);
    }
  });

  it("derives browser scenarios that cover every fixture, native interaction, and param surface", () => {
    const plan = getGpuFlowCompatibilityFixturePlan();
    const allSectionFixtureIds = sorted(
      plan.sectionFixtures.map((fixture) => fixture.fixtureId),
    );
    const allParamFixtureIds = sorted(
      plan.paramFixtures.map((fixture) => fixture.fixtureId),
    );
    const allNativeInteractions = sorted(
      plan.sectionFixtures.flatMap((fixture) => fixture.nativeInteractions),
    ).filter((value, index, values) => values.indexOf(value) === index);
    const allParamSurfaces = sorted(
      plan.paramFixtures.flatMap((fixture) => fixture.surfaces),
    ).filter((value, index, values) => values.indexOf(value) === index);

    const displayScenario = plan.verificationScenarios.find(
      (scenario) => scenario.scenarioId === "sections:display-all-zooms",
    );
    expect(sorted(displayScenario?.sectionFixtureIds ?? [])).toEqual(
      allSectionFixtureIds,
    );
    expect(displayScenario?.zoomLevels).toEqual(
      GPU_FLOW_COMPATIBILITY_ZOOM_LEVELS,
    );

    const paramScenario = plan.verificationScenarios.find(
      (scenario) => scenario.scenarioId === "params:first-interactions",
    );
    expect(sorted(paramScenario?.paramFixtureIds ?? [])).toEqual(
      allParamFixtureIds,
    );
    expect(paramScenario?.paramSurfaces).toEqual(allParamSurfaces);

    for (const nativeInteraction of allNativeInteractions) {
      const scenario = plan.verificationScenarios.find((candidate) =>
        candidate.nativeInteractions.includes(nativeInteraction),
      );
      expect(sorted(scenario?.sectionFixtureIds ?? [])).toEqual(
        sorted(
          plan.sectionFixtures
            .filter((fixture) =>
              fixture.nativeInteractions.includes(nativeInteraction),
            )
            .map((fixture) => fixture.fixtureId),
        ),
      );
    }

    for (const surface of allParamSurfaces) {
      const scenario = plan.verificationScenarios.find(
        (candidate) =>
          candidate.paramSurfaces.length === 1 &&
          candidate.paramSurfaces.includes(surface),
      );
      expect(sorted(scenario?.paramFixtureIds ?? [])).toEqual(
        sorted(
          plan.paramFixtures
            .filter((fixture) => fixture.surfaces.includes(surface))
            .map((fixture) => fixture.fixtureId),
        ),
      );
    }
  });

  it("keeps the high-risk live DOM section families represented in the fixture plan", () => {
    const fixturesByType = new Map(
      getGpuFlowCompatibilityFixturePlan().sectionFixtures.map((fixture) => [
        fixture.sectionType,
        fixture,
      ]),
    );

    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Code,
      "code editing",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.GenPythonCode,
      "code editing",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Terminal,
      "terminal input",
    );
    expectNativeInteraction(fixturesByType, SectionTypeEnum.Chat, "chat input");
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Browser,
      "browser navigation",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.IFrame,
      "iframe pointer and keyboard input",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Plugin,
      "plugin controls",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Spreadsheet,
      "spreadsheet editing",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Draw,
      "pointer drawing",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.TaskBoard,
      "task board controls",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.MetaControl,
      "control first interaction",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Image,
      "media controls",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Chart,
      "chart controls",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Social,
      "social controls",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.TextBlock,
      "text editing",
    );
    expectNativeInteraction(
      fixturesByType,
      SectionTypeEnum.Prompt,
      "text editing",
    );
  });

  it("keeps the high-risk param interaction families represented in the fixture plan", () => {
    const fixturesByType = new Map(
      getGpuFlowCompatibilityFixturePlan().paramFixtures.map((fixture) => [
        fixture.codeObjType,
        fixture,
      ]),
    );

    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.CodeParam,
      "meta-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.TextParam,
      "section-param-ui",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.TextAreaParam,
      "meta-control",
    );
    expectParamSurface(fixturesByType, CodeObjTypeEnum.DateParam, "ui-config");
    expectParamSurface(fixturesByType, CodeObjTypeEnum.TimeParam, "ui-config");
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.SliderParam,
      "configured-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.RotaryParam,
      "configured-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.SwitchParam,
      "meta-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.ColorPickerParam,
      "ui-config",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.DropdownParam,
      "configured-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.PasswordParam,
      "meta-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.DropzoneParam,
      "ui-config",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.ButtonParam,
      "meta-control",
    );
    expectParamSurface(
      fixturesByType,
      CodeObjTypeEnum.NestedParam,
      "param-dnd",
    );
  });
});

function expectNativeInteraction(
  fixturesByType: ReadonlyMap<
    SectionType,
    { nativeInteractions: readonly string[] }
  >,
  sectionType: SectionType,
  nativeInteraction: string,
) {
  expect(fixturesByType.get(sectionType)?.nativeInteractions).toContain(
    nativeInteraction,
  );
}

function expectParamSurface(
  fixturesByType: ReadonlyMap<CodeObjType, { surfaces: readonly string[] }>,
  codeObjType: CodeObjType,
  surface: string,
) {
  expect(fixturesByType.get(codeObjType)?.surfaces).toContain(surface);
}
