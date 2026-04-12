import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/sectionInfos", () => ({
  getCurrProjectConfigId: vi.fn(),
}));

vi.mock("state/actions/sections/createSections", () => ({
  getEmptySpacePosition: vi.fn(),
}));

import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getEmptySpacePosition } from "state/actions/sections/createSections";

import { SectionTypeEnum, TransportRouteConstants } from "./generatedTypes";
import { buildSettaApiPayload, formatSettaApiBody } from "./settaApiPresets";

describe("settaApiPresets", () => {
  beforeEach(() => {
    vi.mocked(getCurrProjectConfigId).mockReturnValue("project-alpha");
    vi.mocked(getEmptySpacePosition).mockReturnValue({ x: 120, y: 240 });
  });

  it("formats preset request bodies from live project state helpers", () => {
    expect(
      JSON.parse(
        formatSettaApiBody(
          TransportRouteConstants.settaApiPresets.createTopLevelSection,
        ),
      ),
    ).toEqual({
      projectConfigId: "project-alpha",
      implType: SectionTypeEnum.TextBlock,
      controlCodeObjType: null,
      implOverrides: {
        type: SectionTypeEnum.TextBlock,
        text: "Hello",
      },
      position: { x: 120, y: 240 },
    });
  });

  it("merges preset defaults with user-provided overrides", () => {
    expect(
      buildSettaApiPayload(
        TransportRouteConstants.settaApiPresets.saveProject,
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
