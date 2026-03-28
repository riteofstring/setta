import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildFilteredParamListView,
  buildPinnedParamsAreaView,
  buildUnpinnedParamsAreaView,
  getPinnedParamsBgClassName,
} from "./groupContainerView";

describe("getPinnedParamsBgClassName", () => {
  it("uses a pure white background for callable sections", () => {
    expect(getPinnedParamsBgClassName(SectionTypeEnum.Callable)).toBe(
      "bg-white dark:bg-blue-950/30",
    );
  });

  it("uses the lighter setta tint for global variables", () => {
    expect(getPinnedParamsBgClassName(SectionTypeEnum.GlobalVariables)).toBe(
      "bg-setta-50 dark:bg-blue-950/30",
    );
  });

  it("uses the standard setta tint for other section types", () => {
    expect(getPinnedParamsBgClassName(SectionTypeEnum.Dict)).toBe(
      "bg-setta-100/50 dark:bg-blue-950/30",
    );
  });
});

describe("buildFilteredParamListView", () => {
  it("drops edge input params from the visible list while keeping the remaining path depth", () => {
    expect(
      buildFilteredParamListView({
        requiredParamIdsToPaths: {
          edgeParam: ["edgeParam"],
          nestedLeaf: ["group", "nestedLeaf"],
        },
        topLevelParamIds: ["edgeParam", "group"],
        edgeInputParams: ["edgeParam"],
      }),
    ).toEqual({
      requiredParamIdsToPaths: {
        nestedLeaf: ["group", "nestedLeaf"],
      },
      topLevelParamIds: ["group"],
      maxNestedDepth: 2,
    });
  });
});

describe("buildPinnedParamsAreaView", () => {
  it("rounds the pinned area bottom only when unpinned params stay hidden", () => {
    expect(
      buildPinnedParamsAreaView({
        requiredParamIdsToPaths: {
          pinnedParam: ["pinnedParam"],
        },
        topLevelParamIds: ["pinnedParam"],
        edgeInputParams: [],
        hideUnpinnedParams: true,
      }),
    ).toMatchObject({
      topLevelParamIds: ["pinnedParam"],
      shouldRoundBottom: true,
      maxNestedDepth: 1,
    });
  });
});

describe("buildUnpinnedParamsAreaView", () => {
  it("normalizes the legacy min height and applies it when the list stays editable", () => {
    expect(
      buildUnpinnedParamsAreaView({
        pinnedRequiredParamIdsToPaths: {
          pinnedParam: ["pinnedParam"],
        },
        pinnedTopLevelParamIds: ["pinnedParam"],
        requiredParamIdsToPaths: {
          edgeParam: ["edgeParam"],
          nestedLeaf: ["group", "nestedLeaf"],
        },
        topLevelParamIds: ["edgeParam", "group"],
        edgeInputParams: ["edgeParam"],
        hideUnpinnedParams: false,
        canEditLayout: true,
        positionAndSizeLocked: false,
        configuredMinHeight: 38,
      }),
    ).toEqual({
      requiredParamIdsToPaths: {
        nestedLeaf: ["group", "nestedLeaf"],
      },
      topLevelParamIds: ["group"],
      maxNestedDepth: 2,
      hasPinnedParams: true,
      minHeight: 36,
      shouldApplyMinHeight: true,
    });
  });

  it("keeps the resolved min height but suppresses it when the area is hidden or locked", () => {
    expect(
      buildUnpinnedParamsAreaView({
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        requiredParamIdsToPaths: {
          paramA: ["paramA"],
        },
        topLevelParamIds: ["paramA"],
        edgeInputParams: [],
        hideUnpinnedParams: true,
        canEditLayout: true,
        positionAndSizeLocked: true,
        configuredMinHeight: 52,
      }),
    ).toEqual({
      requiredParamIdsToPaths: {
        paramA: ["paramA"],
      },
      topLevelParamIds: ["paramA"],
      maxNestedDepth: 1,
      hasPinnedParams: false,
      minHeight: 52,
      shouldApplyMinHeight: false,
    });
  });
});
