import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/sectionInfos", () => ({
  getCurrProjectConfigId: vi.fn(),
}));

vi.mock("state/actions/sections/createSections", () => ({
  getEmptySpacePosition: vi.fn(),
}));

import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getEmptySpacePosition } from "state/actions/sections/createSections";

import { GoHTTPRoutes } from "./generatedRoutes";
import { SectionTypeEnum } from "./generatedTypes";
import {
  buildSettaApiPayload,
  formatSettaApiBody,
  SETTA_API_PRESETS,
} from "./settaApiPresets";

describe("settaApiPresets", () => {
  beforeEach(() => {
    vi.mocked(getCurrProjectConfigId).mockReturnValue("project-alpha");
    vi.mocked(getEmptySpacePosition).mockReturnValue({ x: 120, y: 240 });
  });

  it("keeps preset routes aligned with canonical generated route constants", () => {
    expect(SETTA_API_PRESETS.map((preset) => preset.route)).toEqual([
      GoHTTPRoutes.createTopLevelSection,
      GoHTTPRoutes.getLatestProjectState,
      GoHTTPRoutes.saveProject,
    ]);
  });

  it("formats preset request bodies from live project state helpers", () => {
    expect(formatSettaApiBody(GoHTTPRoutes.createTopLevelSection)).toBe(
      JSON.stringify(
        {
          projectConfigId: "project-alpha",
          implType: SectionTypeEnum.TextBlock,
          controlCodeObjType: null,
          implOverrides: {
            type: SectionTypeEnum.TextBlock,
            text: "Hello",
          },
          position: { x: 120, y: 240 },
        },
        null,
        2,
      ),
    );
  });

  it("merges preset defaults with user-provided overrides", () => {
    expect(
      buildSettaApiPayload(
        GoHTTPRoutes.saveProject,
        JSON.stringify({
          projectConfigId: "project-override",
          extra: "value",
        }),
      ),
    ).toEqual({
      projectConfigId: "project-override",
      extra: "value",
    });
  });

  it("passes custom routes through without preset shaping", () => {
    expect(formatSettaApiBody("/customRoute")).toBe("");
    expect(
      buildSettaApiPayload(
        "/customRoute",
        JSON.stringify({ alpha: 1, beta: "two" }),
      ),
    ).toEqual({
      alpha: 1,
      beta: "two",
    });
  });
});
