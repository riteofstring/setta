import { getTempParamDndId } from "forks/dnd-kit/paramDndState";
import { describe, expect, it, vi } from "vitest";
import { resolveVisibleParamIds } from "./paramSwitchView";

describe("resolveVisibleParamIds", () => {
  it("keeps every path-backed param row when no filter is active", () => {
    const getDisplayName = vi.fn((paramId: string) => paramId);

    expect(
      resolveVisibleParamIds({
        paramIds: ["parent", "child", "orphan"],
        requiredParamIdsToPaths: {
          child: ["parent", "child"],
        },
        paramFilter: "",
        getParamDisplayName: getDisplayName,
      }),
    ).toEqual(["parent", "child"]);
    expect(getDisplayName).not.toHaveBeenCalled();
  });

  it("expands filtered leaf matches back through their visible ancestor path", () => {
    expect(
      resolveVisibleParamIds({
        paramIds: ["alpha-group", "alpha-leaf", "beta-group", "beta-leaf"],
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
          "beta-leaf": ["beta-group", "beta-leaf"],
        },
        paramFilter: "beta",
        getParamDisplayName: (paramId: string) =>
          ({
            "alpha-leaf": "Alpha Setting",
            "beta-leaf": "Beta Setting",
          })[paramId] ?? paramId,
      }),
    ).toEqual(["beta-group", "beta-leaf"]);
  });

  it("keeps temp placeholder rows visible even when the filter hides all real params", () => {
    const tempParamId = getTempParamDndId(
      "beta-leaf::settaParamList::unpinned",
    );

    expect(
      resolveVisibleParamIds({
        paramIds: ["alpha-group", "alpha-leaf", tempParamId],
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
        },
        paramFilter: "missing",
        getParamDisplayName: () => "Alpha Setting",
      }),
    ).toEqual([tempParamId]);
  });
});
