import { describe, expect, it } from "vitest";
import art from "../../examples/art-studio/fixture/project.json";
import arena from "../../examples/model-arena/fixture/project.json";
import rover from "../../examples/rover-mission/fixture/project.json";
import training from "../../examples/training-system/fixture/project.json";
import { getPlayground } from "./playgroundCatalog";
import {
  callableSectionID,
  listSectionID,
  parameterDictionarySectionID,
} from "./workspaceProjection";

describe("playground guide destinations", () => {
  for (const fixture of [rover, arena, art, training]) {
    it(`can navigate every ${fixture.project.name} step in its shipped project`, () => {
      const playground = getPlayground(fixture.project.id);
      expect(playground).toBeDefined();
      if (!playground) return;
      const ids = new Set([
        "python-canvas:generated-python",
        ...fixture.callables.map((item) => callableSectionID(item.id)),
        ...fixture.lists.map((item) => listSectionID(item.id)),
        ...fixture.parameterDictionaries.map((item) =>
          parameterDictionarySectionID(item.id),
        ),
        ...playground.panels.map(
          (panel) => `python-canvas:display:${panel.id}`,
        ),
      ]);
      expect(ids.has(playground.control)).toBe(true);
      for (const step of playground.steps)
        expect(ids.has(step.sectionId), step.actionLabel).toBe(true);
      expect(new Set(playground.steps.map((step) => step.sectionId)).size).toBe(
        playground.steps.length,
      );
    });
  }
});
